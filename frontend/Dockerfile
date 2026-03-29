FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_ORDER_API_BASE_URL=http://localhost:8080
ARG VITE_INVENTORY_API_BASE_URL=http://localhost:8081
ARG VITE_PAYMENT_API_BASE_URL=http://localhost:8082
ARG VITE_GRAFANA_URL=http://localhost:3000

ENV VITE_ORDER_API_BASE_URL=${VITE_ORDER_API_BASE_URL}
ENV VITE_INVENTORY_API_BASE_URL=${VITE_INVENTORY_API_BASE_URL}
ENV VITE_PAYMENT_API_BASE_URL=${VITE_PAYMENT_API_BASE_URL}
ENV VITE_GRAFANA_URL=${VITE_GRAFANA_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

