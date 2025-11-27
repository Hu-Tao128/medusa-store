FROM node:20-alpine

WORKDIR /app/medusa

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

EXPOSE 9000

CMD ["yarn", "start"]
