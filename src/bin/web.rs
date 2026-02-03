use actix_cors::Cors;
use actix_web::web;
use actix_web::HttpResponse;
use common::JobProgress;
use common::JobStatus;
use common::RedisUtils;
use common::Result;
use redis::AsyncCommands;
use serde::Deserialize;
use serde::Serialize;
use std::cell::LazyCell;

const DEFAULT_PAGE_SIZE: usize = 100;

#[actix_web::main]
pub async fn main() -> Result<()> {
    env_logger::init();

    let config = common::read_config().await;

    actix_web::HttpServer::new(|| {
        let cors = Cors::default().allow_any_header().allow_any_method().allow_any_origin();

        actix_web::App::new()
            .wrap(cors)
            .service(get_version)
            .service(get_jobs)
            .service(get_job)
            .service(post_job)
            .service(post_challenge)
    })
    .bind(config.web.socket)
    .expect("Failed to bind to socket")
    .run()
    .await?;

    Ok(())
}

#[actix_web::get("/version")]
pub async fn get_version() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json! {{
        "success": true,
        "service": "certmaster-api",
        "version": env!("CARGO_PKG_VERSION").to_string(),
    }})
}

#[derive(Serialize, Deserialize)]
pub struct Pagination {
    page: Option<usize>,
    page_size: Option<usize>,
    cn: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct DetailedCsr {
    #[serde(flatten)]
    csr: common::Csr,

    cn: Option<String>,
}

#[actix_web::get("/get-enqueued-items")]
pub async fn get_jobs(pagination: web::Query<Pagination>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let page = pagination.page.unwrap_or(0);
    let size = pagination.page_size.unwrap_or(DEFAULT_PAGE_SIZE);

    let get_jobs: Vec<String> = match redis
        .zrevrange(&config.redis.job_list_key, (page * size) as isize, ((page + 1) * (size - 1)) as isize)
        .await
    {
        Ok(job_list) => job_list,
        Err(err) => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json! {{
                "success": false,
                "error": err.to_string(),
            }}));
        }
    };

    if !get_jobs.is_empty() {
        let values = match redis.mget::<_, Vec<common::Csr>>(&get_jobs).await {
            Ok(values) => values
                .into_iter()
                .map(|csr| {
                    let decoded = LazyCell::new(|| rcgen::CertificateSigningRequestParams::from_pem(csr.pem())
                        .ok()
                        .map(|csr| csr.params));

                    DetailedCsr {
                        cn: pagination.cn.is_some_and(|i| i).then(|| {
                            decoded.as_ref()
                                .and_then(|i| i.distinguished_name
                                    .get(&rcgen::DnType::CommonName)
                                    .and_then(|i| match i {
                                        rcgen::DnValue::Utf8String(str) => Some(str.clone()),
                                        rcgen::DnValue::PrintableString(str) => Some(str.to_string()),
                                        _ => None
                                    }))
                        }).flatten(),
                        csr,
                    }
                })
                .collect::<Vec<_>>(),
            Err(err) => {
                return Ok(HttpResponse::InternalServerError().json(serde_json::json! {{
                    "success": false,
                    "error": err.to_string(),
                }}));
            }
        };

        Ok(HttpResponse::Ok().json(serde_json::json! {{
            "success": true,
            "jobs": values
        }}))
    } else {
        Ok(HttpResponse::Ok().json(serde_json::json! {{
            "success": true,
            "jobs": []
        }}))
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Selection {
    jobs: String,
}

impl Selection {
    fn jobs(&self) -> std::result::Result<Vec<String>, std::str::Utf8Error> {
        self.jobs
            .split('+')
            .map(|id| percent_encoding::percent_decode_str(id).decode_utf8())
            .map(|i| i.map(|i| i.to_string()))
            .collect::<std::result::Result<Vec<_>, std::str::Utf8Error>>()
    }
}

#[actix_web::get("/job")]
pub async fn get_job(id: web::Query<Selection>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let jobs = match id.jobs() {
        Ok(jobs) => jobs,
        Err(err) =>
            return Ok(HttpResponse::BadRequest().json(serde_json::json! {{
                "success": false,
                "error": err.to_string()
            }})),
    };

    let alias = match common::RedisUtils::get_jobs_by_alias(&mut redis, jobs.iter()).await {
        Ok(job_by_alias) => job_by_alias
            .into_iter()
            .map(|i| format!("csr:{id}", id = i.serial))
            .collect::<Vec<_>>(),
        Err(err) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json! {{
                "success": false,
                "error": err.to_string(),
            }}));
        }
    };

    if alias.is_empty() {
        return Ok(HttpResponse::Ok().json(serde_json::json! {{
            "success": true,
            "jobs": []
        }}));
    }

    let csr: Vec<common::Csr> = match redis.mget(alias).await {
        Ok(csr) => csr,
        Err(err) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json! {{
                "success": false,
                "error": err.to_string(),
            }}));
        }
    };

    Ok(HttpResponse::Ok().json(serde_json::json! {{
        "success": true,
        "jobs": csr
    }}))
}

#[derive(Serialize, Deserialize)]
pub struct Ack {
    pub alt: String,
}

#[actix_web::post("/job")]
pub async fn post_job(requests: web::Json<Vec<common::NewCsr>>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    for request in requests.iter() {
        let alt = request.alt();

        match redis.dispatch_event(request.clone()).await {
            Ok(()) => (),
            Err(err) => {
                return Ok(HttpResponse::InternalServerError().json(serde_json::json! {{
                    "success": false,
                    "error": err.to_string(),
                }}));
            }
        };
    }

    Ok(HttpResponse::Ok().json(serde_json::json! {{
        "success": true,
        "jobs": requests
            .iter()
            .map(|i| Ack { alt: i.alt() })
            .collect::<Vec<_>>()
    }}))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OverrideChallenge {
    jobs: Vec<String>,
}

#[actix_web::post("/challenge")]
pub async fn post_challenge(id: web::Json<OverrideChallenge>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    match common::RedisUtils::get_jobs_by_alias(&mut redis, id.jobs.iter()).await {
        Ok(job_by_alias) =>
            for id in job_by_alias {
                if let Err(err) = redis
                    .dispatch_event(JobProgress {
                        id: id.serial,
                        status: JobStatus::ChallengePassed,
                    })
                    .await
                {
                    return Ok(HttpResponse::InternalServerError().json(serde_json::json! {{
                        "success": false,
                        "error": err.to_string(),
                    }}));
                }
            },
        Err(err) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json! {{
                "success": false,
                "error": err.to_string(),
            }}));
        }
    };

    Ok(HttpResponse::Ok().json(serde_json::json! {{
        "success": true,
        "jobs": id.jobs
    }}))
}
