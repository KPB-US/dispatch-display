FROM node:6
WORKDIR /home/node/app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
USER node
CMD [ "npm" , "start" ]
