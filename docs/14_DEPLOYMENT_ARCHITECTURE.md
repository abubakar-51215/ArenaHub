# Arena Hub — Deployment Architecture

**Version:** 2.0

---

## 1. Containerization

All services are containerized using Docker and orchestrated with Docker Compose.

### Docker Compose Services

| Service | Image | Port | Description |
|---|---|---|---|
| fastapi-backend | Custom | 8000 | FastAPI application server |
| postgresql | postgres:15 | 5432 | Primary relational database |
| redis | redis:7-alpine | 6379 | Distributed locking and caching |
| nextjs-web | Custom | 3000 | Web dashboard (Owner + Admin) |

### docker-compose.yml Structure
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/arenahub
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=...
      - STRIPE_KEY=...
      - FCM_KEY=...
    depends_on: [db, redis]
    
  db:
    image: postgres:15
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      - POSTGRES_DB=arenahub
      - POSTGRES_USER=arenahub
      - POSTGRES_PASSWORD=...
      
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    
  web:
    build: ./web
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000/api/v1
    depends_on: [backend]

volumes:
  pgdata:
```

---

## 2. Environment Configuration

### Environment Variables
| Variable | Service | Description |
|---|---|---|
| DATABASE_URL | Backend | PostgreSQL connection string |
| REDIS_URL | Backend | Redis connection string |
| JWT_SECRET | Backend | JWT signing key |
| JWT_REFRESH_SECRET | Backend | Refresh token signing key |
| STRIPE_SECRET_KEY | Backend | Stripe API key |
| JAZZCASH_MERCHANT_ID | Backend | JazzCash merchant credentials |
| EASYPAISA_MERCHANT_ID | Backend | EasyPaisa merchant credentials |
| FCM_SERVER_KEY | Backend | Firebase Cloud Messaging key |
| GOOGLE_MAPS_API_KEY | Backend + Mobile | Google Maps API key |
| NEXT_PUBLIC_API_URL | Web | Backend API base URL |

---

## 3. Database Migrations

- **Tool:** Alembic (SQLAlchemy migrations)
- Migrations run automatically on container startup
- Version-controlled migration files in `/backend/alembic/versions/`

---

## 4. Health Checks

| Service | Endpoint | Check |
|---|---|---|
| Backend | GET /health | Returns 200 if API is running |
| PostgreSQL | pg_isready | Database accepting connections |
| Redis | redis-cli ping | Redis responding with PONG |

---

## 5. Development vs Production

| Aspect | Development | Production |
|---|---|---|
| Database | Local PostgreSQL container | Cloud-hosted PostgreSQL (e.g., AWS RDS, Supabase) |
| Redis | Local Redis container | Cloud Redis (e.g., AWS ElastiCache, Redis Cloud) |
| Backend | Single FastAPI instance | Multiple instances with load balancer |
| HTTPS | Self-signed / HTTP | Let's Encrypt / managed SSL |
| Logs | Console output | Centralized logging service |

---

End of Document
