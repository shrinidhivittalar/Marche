-- Drops two indexes that duplicate the index Postgres already creates for
-- their column's UNIQUE constraint: "users_email_key" (from email @unique)
-- already covers every query "users_email_idx" could, and the same is true
-- of "profiles_username_key" / "profiles_username_idx". Purely a storage
-- and write-cost saving — nothing reads through these two by name, and
-- the unique constraint itself is untouched.

-- DropIndex
DROP INDEX "users_email_idx";

-- DropIndex
DROP INDEX "profiles_username_idx";
