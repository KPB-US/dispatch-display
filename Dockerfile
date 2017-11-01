FROM node:6
EXPOSE 3000
WORKDIR /home/node/app
COPY package.json .
RUN npm install
COPY . .
CMD [ "npm" , "start" ]
# build with:
#   docker build -t dispatch-display .
# Run with the following, being sure to share the host network or the stations
# wont be identifiable based on their ip addresses.
#   docker run -p 3000:3000 -d --network=host dispatch-display
