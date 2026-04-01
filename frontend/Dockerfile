FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_ORDER_API_BASE_URL=https://order.fsengine.dev
ARG VITE_INVENTORY_API_BASE_URL=https://inventory.fsengine.dev
ARG VITE_PAYMENT_API_BASE_URL=https://payment.fsengine.dev
ARG VITE_GRAFANA_URL=https://grafana.fsengine.dev

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

