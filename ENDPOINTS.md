# Documentacion de Endpoints

Esta API usa **rutas file-based de Medusa** (`src/api/**/route.ts`).

## Base URL

- Local: `http://localhost:9000`
- Ejemplo de endpoint: `GET http://localhost:9000/products`

> Nota: en este proyecto hay comentarios con prefijo `/api/...`, pero en Medusa la ruta real corresponde al path dentro de `src/api` (por ejemplo `src/api/products/route.ts` => `/products`).

## Autenticacion

Hay 2 tipos de token en uso:

1. **Firebase ID token**
   - Se valida con `admin.auth().verifyIdToken(...)`
   - Se usa en:
     - `GET /customer`
     - `GET /customer/:id`
     - `POST /customer/:id`
     - `PUT /customer/:id`

2. **JWT Medusa (Bearer)**
   - Se firma con `JWT_SECRET`
   - Se obtiene en:
     - `POST /customer`
     - `GET /customer`
   - Se usa en la mayoria de endpoints de seller, address y orders.

Header esperado:

```http
Authorization: Bearer <token>
```

---

## Endpoints

## 1) Clientes

### `POST /customer`
Registra/sincroniza cliente con Firebase y retorna JWT Medusa.

- Body:

```json
{
  "email": "cliente@correo.com",
  "firebaseUid": "firebase_uid"
}
```

- Respuesta OK:

```json
{
  "customer": { "id": "cus_...", "email": "cliente@correo.com" },
  "medusaToken": "eyJ..."
}
```

### `GET /customer`
Obtiene el customer actual usando **Firebase token** y retorna tambien `medusaToken`.

### `GET /customer/:id`
Obtiene customer por ID y datos complementarios de Firebase.

### `POST /customer/:id`
Actualiza customer (alias de update).

### `PUT /customer/:id`
Actualiza customer.

- Body opcional:

```json
{
  "firstName": "Nombre",
  "lastName": "Apellido",
  "phoneNumber": "+521...",
  "photoUrl": "https://...",
  "firebaseUid": "firebase_uid"
}
```

---

## 2) Direcciones

### `GET /address`
Lista direcciones del customer autenticado (JWT Medusa).

### `POST /address`
Crea direccion para el customer autenticado.

- Body (ejemplo):

```json
{
  "first_name": "Juan",
  "last_name": "Perez",
  "phone": "5555555555",
  "address_1": "Calle 123",
  "city": "CDMX",
  "province": "CDMX",
  "country_code": "mx",
  "postal_code": "01000"
}
```

### `POST /address/:id`
Actualiza direccion por ID.

### `PUT /address/:id`
Alias de `POST /address/:id`.

### `DELETE /address/:id`
Elimina direccion por ID.

---

## 3) Sellers y tienda

### `POST /sellers`
Crea cuenta seller para el customer autenticado (JWT Medusa).

- Body:

```json
{
  "store_name": "Mi tienda"
}
```

### `GET /seller/products`
Lista productos del seller autenticado.

### `GET /store/:id`
Lista productos publicados de una tienda/seller (`metadata.seller_id === :id`).

---

## 4) Productos

### `GET /products`
Lista productos publicados con variantes, precios normalizados e inventario calculado.

### `POST /products`
Crea producto para seller autenticado.

- Requiere JWT Medusa y que el customer sea seller.
- Body minimo:

```json
{
  "title": "Producto nuevo",
  "variants": [
    { "title": "Default", "price": 199.99, "quantity": 10 }
  ]
}
```

- Campos opcionales: `description`, `thumbnail`, `images`, `collection_id`, `category_ids`.

### `GET /products/:id`
Obtiene producto por ID con variantes, precios e inventario.

### `POST /products/:id`
Agrega variantes a un producto existente.

- Requiere JWT Medusa y ownership del producto por seller.
- Body:

```json
{
  "variants": [
    { "title": "Talla M", "price": 249.99 },
    { "title": "Talla L", "price": 259.99 }
  ]
}
```

### `GET /products/:id/related`
Devuelve productos relacionados segun `custom.related_products`.

### `GET /products/:id/recommendations?type=all`
Devuelve recomendaciones desde el modulo `customProducts`.

- Query param opcional: `type` (default `all`).

---

## 5) Catalogo (colecciones y categorias)

### `GET /collections`
Lista colecciones (`id`, `title`, `handle`).

### `GET /categories`
Lista categorias activas en estructura jerarquica (arbol padre-hijo).

---

## 6) Inventario

### `GET /inventory`
Lista inventario por variante (cantidad total disponible por variante).

### `GET /inventory/:id`
Devuelve inventario por variante para un **producto** (`:id = product id`).

> Nota: no hay `POST /inventory` activo; en el codigo aparece comentado.

---

## 7) Ordenes

### `GET /orders`
Lista ordenes del customer autenticado (JWT Medusa).

### `GET /orders/:id`
Obtiene detalle de una orden especifica del customer autenticado.

---

## 8) Promociones

### `GET /validate/code/:id`
Valida codigo promocional activo.

- `:id` = codigo promocional.
- Respuesta valida:

```json
{
  "valid": true,
  "id": "promo_...",
  "description": "Nombre de campana"
}
```

---

## 9) Email transaccional

### `POST /sendEmail`
Envia email transaccional (confirmacion, pago, preparacion o envio).

- Body:

```json
{
  "to": "cliente@correo.com",
  "type": "confirmation",
  "order_id": "order_...",
  "customer_id": "cus_...",
  "tracking_number": "TRK123",
  "carrier": "DHL",
  "payment_method": "card",
  "custom_data": { "foo": "bar" }
}
```

- Tipos permitidos (`type`):
  - `confirmation`
  - `payment`
  - `preparation`
  - `shipment`

### `GET /sendEmail`
Verifica conexion SMTP.

---

## 10) Admin

### `GET /admin/custom`
Endpoint basico de salud para admin (retorna 200).

---

## Ejemplos cURL rapidos

### Crear/obtener customer y token Medusa

```bash
curl -X POST http://localhost:9000/customer \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cliente@correo.com",
    "firebaseUid": "firebase_uid"
  }'
```

### Crear producto como seller

```bash
curl -X POST http://localhost:9000/products \
  -H "Authorization: Bearer <MEDUSA_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Nuevo producto",
    "variants": [{ "title": "Default", "price": 199.99, "quantity": 5 }]
  }'
```

### Listar direcciones

```bash
curl http://localhost:9000/address \
  -H "Authorization: Bearer <MEDUSA_JWT>"
```
