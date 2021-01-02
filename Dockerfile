FROM node:15-slim

RUN apt-get update \
  && apt-get install -y git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock /app/

WORKDIR /app

RUN yarn install --production --frozen-lockfile

COPY . /app/

CMD [ "yarn", "backup" ]
