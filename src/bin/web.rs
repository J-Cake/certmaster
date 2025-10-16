use actix_web::HttpResponse;
use actix_web::middleware::Identity;
use actix_web::web;
use common::Result;
use common::{JobProgress, JobStatus, RedisUtils};
use redis::AsyncCommands;
use serde::Deserialize;
use serde::Serialize;

const DEFAULT_PAGE_SIZE: usize = 100;

#[actix_web::main]
pub async fn main() -> Result<()> {
    env_logger::init();

    let config = common::read_config().await;

    actix_web::HttpServer::new(|| {
        actix_web::App::new()
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
    HttpResponse::Ok()
        .json(serde_json::json! {{
            "success": true,
            "service": "certmaster-api",
            "version": env!("CARGO_PKG_VERSION").to_string(),
        }})
}

#[derive(Serialize, Deserialize)]
pub struct Pagination {
    page: Option<usize>,
    page_size: Option<usize>,
}

#[actix_web::get("/jobs")]
pub async fn get_jobs(pagination: web::Query<Pagination>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let page = pagination.page.unwrap_or(0);
    let size = pagination.page_size.unwrap_or(DEFAULT_PAGE_SIZE);

    let get_jobs: Vec<String> = match redis
        .zrevrange(
            &config.redis.job_list_key,
            (page * size) as isize,
            ((page + 1) * (size - 1)) as isize,
        )
        .await
    {
        Ok(job_list) => job_list,
        Err(err) => {
            return Ok(
                HttpResponse::InternalServerError().json(serde_json::json! {{
                    "success": false,
                    "error": err.to_string(),
                }}),
            );
        }
    };

    if !get_jobs.is_empty() {
        let values: Vec<common::Csr> = match redis.mget(&get_jobs).await {
            Ok(values) => values,
            Err(err) => {
                return Ok(
                    HttpResponse::InternalServerError().json(serde_json::json! {{
                        "success": false,
                        "error": err.to_string(),
                    }}),
                );
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

#[derive(Serialize, Deserialize)]
pub struct Selection {
    jobs: Vec<String>,
}

#[actix_web::get("/job")]
pub async fn get_job(id: web::Query<Selection>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let alias = match common::RedisUtils::get_jobs_by_alias(&mut redis, id.jobs.iter()).await {
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
                return Ok(
                    HttpResponse::InternalServerError().json(serde_json::json! {{
                        "success": false,
                        "error": err.to_string(),
                    }}),
                );
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

#[actix_web::post("/challenge")]
pub async fn post_challenge(id: web::Json<Selection>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    match common::RedisUtils::get_jobs_by_alias(&mut redis, id.jobs.iter()).await {
        Ok(job_by_alias) => {
            for id in job_by_alias {
                if let Err(err) = redis
                    .dispatch_event(JobProgress {
                        id: id.serial,
                        status: JobStatus::ChallengePassed,
                    })
                    .await
                {
                    return Ok(
                        HttpResponse::InternalServerError().json(serde_json::json! {{
                            "success": false,
                            "error": err.to_string(),
                        }}),
                    );
                }
            }
        }
        Err(err) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json! {{
                "success": false,
                "error": err.to_string(),
            }}));
        }
    };

    Ok(HttpResponse::Ok().json(serde_json::json! {{
        "success": true,
        "jobs": id.jobs.clone()
    }}))
}
