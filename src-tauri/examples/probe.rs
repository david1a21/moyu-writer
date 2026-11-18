use std::time::Instant;

#[tokio::main]
async fn main() {
    let url = "https://dav.jianguoyun.com/dav/probe/inkwell-sync.json";
    let t = Instant::now();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("client");

    let method = reqwest::Method::from_bytes(b"PROPFIND").expect("method");

    match client
        .request(method, url)
        .basic_auth("probe@test.com", Some("probe123"))
        .header("Depth", "0")
        .send()
        .await
    {
        Ok(r) => println!("状态 {} 耗时 {:?}", r.status().as_u16(), t.elapsed()),
        Err(e) => println!("失败 {:?} 耗时 {:?}", e, t.elapsed()),
    }
}
