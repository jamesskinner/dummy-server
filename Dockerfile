FROM node:14.8-slim

ENV NODE_ENV=production

EXPOSE 5000

USER node

COPY ./src /server
COPY ./data /server/data/

WORKDIR /server

ENTRYPOINT ["node"]
CMD ["--abort-on-uncaught-exception", "./index.js"]
