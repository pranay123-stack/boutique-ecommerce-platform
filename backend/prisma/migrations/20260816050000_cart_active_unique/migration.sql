-- A customer keeps one cart per completed order, so `userId` cannot be
-- globally unique: the CONVERTED cart would permanently own the slot and the
-- customer's next "add to cart" would fail with a unique-constraint violation.
-- Uniqueness is what we actually want *per active cart*, which is exactly what
-- a partial unique index expresses.

DROP INDEX IF EXISTS "carts_userId_key";
DROP INDEX IF EXISTS "carts_sessionId_key";

CREATE INDEX IF NOT EXISTS "carts_userId_idx" ON "carts"("userId");
CREATE INDEX IF NOT EXISTS "carts_sessionId_idx" ON "carts"("sessionId");

CREATE UNIQUE INDEX "carts_active_user_uniq"
    ON "carts"("userId")
    WHERE "status" = 'ACTIVE' AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "carts_active_session_uniq"
    ON "carts"("sessionId")
    WHERE "status" = 'ACTIVE' AND "sessionId" IS NOT NULL;
