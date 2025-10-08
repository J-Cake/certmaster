FROM rust:trixie AS RUST

LABEL authors="jcake"

ARG CHECKOUT="https://github.com/J-Cake/certmaster.git/tree/master"

WORKDIR "/app"
RUN git clone ${CHECKOUT} && cd certmaster
RUN cargo build --release --message-f

FROM node:trixie AS NODE

WORKDIR "/app"
COPY --from=RUST "/app/certmaster" "/app/certmaster"
RUN npm install
RUN npm run build:release

FROM debian:trixie-slim AS RUN

COPY --from=RUST "/app/certmaster/"

ENTRYPOINT ["echo", "hello"]