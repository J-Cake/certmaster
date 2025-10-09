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
            .service(jobs)
            .service(csr)
            .service(new_csr)
    })
    .bind(config.web.socket)
    .expect("Failed to bind to socket")
    .run()
    .await?;

    Ok(())
}

macro_rules! get_job {
    ($redis:expr, $job:expr) => {
        match common::RedisUtils::get_job(&mut $redis, &$job).await {
            Ok(csr) => csr,
            Err(err) => return Ok(HttpResponse::NotFound().json(err.to_string())),
        }
    };
}

#[derive(Serialize, Deserialize)]
pub struct Pagination {
    page: Option<usize>,
    page_size: Option<usize>,
}

#[actix_web::get("/jobs")]
pub async fn jobs(pagination: web::Query<Pagination>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let page = pagination.page.unwrap_or(0);
    let size = pagination.page_size.unwrap_or(DEFAULT_PAGE_SIZE);

    let jobs: Vec<String> = match redis
        .zrevrange(
            &config.redis.job_list_key,
            (page * size) as isize,
            ((page + 1) * size) as isize,
        )
        .await
    {
        Ok(job_list) => job_list,
        Err(err) => return Ok(HttpResponse::InternalServerError().json(err.to_string())),
    };

    if !jobs.is_empty() {
        let values: Vec<common::Csr> = match redis.mget(&jobs).await {
            Ok(values) => values,
            Err(err) => return Ok(HttpResponse::InternalServerError().json(err.to_string())),
        };

        Ok(HttpResponse::Ok().json(values))
    } else {
        Ok(HttpResponse::Ok().json([] as [common::Csr; 0]))
    }
}

#[actix_web::get("/csr/{id}")]
pub async fn csr(id: web::Path<String>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let alias: common::ClientJob = get_job!(redis, id);

    let csr: common::Csr = match redis.get(format!("csr:{id}", id = alias.serial)).await {
        Ok(csr) => csr,
        Err(err) => return Ok(HttpResponse::NotFound().json(err.to_string())),
    };

    Ok(HttpResponse::Ok().json(csr))
}

#[derive(Serialize, Deserialize)]
pub struct Ack {
    pub alt: String,
}

#[actix_web::post("/csr")]
pub async fn new_csr(request: web::Json<common::NewCsr>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let alt = request.alt();

    match redis.dispatch_event(request.0).await {
        Ok(()) => Ok(HttpResponse::Ok().json(Ack { alt })),
        Err(err) => Ok(HttpResponse::InternalServerError().json(err.to_string())),
    }
}

#[actix_web::post("/csr/{id}/challenge")]
pub async fn challenge(id: web::Path<String>) -> actix_web::Result<HttpResponse> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let alias: common::ClientJob = get_job!(redis, id);

    match redis
        .dispatch_event(JobProgress {
            id: alias.serial,
            status: JobStatus::ChallengePassed,
        })
        .await
    {
        Ok(()) => Ok(HttpResponse::Ok().json(Ack { alt: id.to_string() })),
        Err(err) => Ok(HttpResponse::InternalServerError().json(err.to_string())),
    }
}
