FROM nginx
RUN rm /etc/nginx/conf.d/default.conf
ADD dispatch-display.conf /etc/nginx/conf.d/
RUN mkdir -p /var/local/dispatch-display
COPY public/ /var/local/dispatch-display/
EXPOSE 80
EXPOSE 443