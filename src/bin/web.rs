use actix_web::web;
use actix_web::HttpResponse;
use common::Result;
use redis::AsyncCommands;
use serde::Deserialize;
use serde::Serialize;

const DEFAULT_PAGE_SIZE: usize = 100;

#[actix_web::main]
pub async fn main() -> Result<()> {
    env_logger::init();

    let config = common::read_config().await;

    actix_web::HttpServer::new(|| actix_web::App::new().service(jobs))
        .bind(config.web.socket)
        .expect("Failed to bind to socket")
        .run()
        .await?;

    Ok(())
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
        .zrevrange(&config.redis.job_list_key, (page * size) as isize, ((page + 1) * size) as isize)
        .await
    {
        Ok(job_list) => job_list,
        Err(err) => return Ok(HttpResponse::InternalServerError().json(err.to_string()).into()),
    };

    Ok(HttpResponse::Ok().json(jobs).into())
}
