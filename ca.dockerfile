FROM rust:trixie AS rust

LABEL authors="jcake"

ARG CHECKOUT="https://github.com/J-Cake/certmaster.git/"

WORKDIR "/app"
RUN apt update && apt upgrade -y && apt install jq -y
RUN git clone ${CHECKOUT} && cd certmaster
WORKDIR "/app/certmaster"
RUN mkdir out
RUN cp $(cargo build --release --message-format json | jq -sr '.[] | select(.reason == "compiler-artifact" and .executable).executable') ./out

FROM node:trixie AS node

LABEL authors="jcake"

COPY --from=rust "/app/certmaster" "/app/certmaster"
WORKDIR "/app/certmaster"
RUN npm install
RUN npm run build:release

FROM debian:trixie-slim AS certmaster

LABEL authors="jcake"

RUN mkdir -p "./out" "/etc/certmaster"
COPY --from=rust "/app/certmaster/out/*" "/bin"
COPY --from=rust "/app/certmaster/config.toml" "/etc/certmaster/config.toml"

VOLUME "/etc/certmaster"

ENV RUST_LOG=info

ENTRYPOINT ["/bin/certmaster"]

FROM caddy:latest AS public
COPY --from=node "/app/certmaster/build" "/var/www/html"

VOLUME "/var/www/html"
#VOLUME "/etc/caddy/Caddyfile"
