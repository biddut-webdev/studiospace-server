# StudioSpace Server

StudioSpace Server is the backend API for the StudioSpace studio rental and booking platform. It is built with Express.js and MongoDB.

## Technology Stack

- Node.js
- Express.js
- MongoDB
- Better Auth
- JSON Web Token (JWT)
- Cookie Parser
- Multer
- ImgBB API

## Features

- RESTful API for studio management.
- Create, read, update, and delete studio listings.
- User authentication and JWT-based API protection.
- HTTP-only cookie authentication.
- Studio booking management.
- Prevent overlapping confirmed bookings.
- Host booking status management.
- Personal wishlist management.
- Confirmed booking invoice data endpoint.
- Image upload using ImgBB.
- Owner-based authorization for studio operations.

## API Base URL

**Local:** `http://localhost:5000`

**Production:** `ADD_YOUR_DEPLOYED_SERVER_URL`

## Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/biddut-webdev/studiospace-server.git
cd studiospace-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the server root directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your_better_auth_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
IMGBB_API_KEY=your_imgbb_api_key
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

Never commit your actual environment variables or secret keys.

### 4. Start the server

```bash
npm run dev
```

The backend will run at `http://localhost:5000`.

## Frontend Repository

[StudioSpace Client Repository](https://github.com/biddut-webdev/studiospace-client)

## Author

StudioSpace — Programming Hero Batch 14 Assignment Project.