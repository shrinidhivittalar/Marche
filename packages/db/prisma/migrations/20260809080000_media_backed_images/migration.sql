-- Images become references to uploaded media instead of pasted URLs.
--
-- Written by hand rather than generated, so the destructive parts are
-- explicit and reviewable. Two columns are dropped:
--
--   portfolio_images.url
--   profiles.avatar
--
-- Both were plain strings holding a URL someone typed in. Verified empty
-- before writing this migration: 0 portfolio items, 0 portfolio images,
-- 0 services, 0 profiles with an avatar. Nothing is lost, and this only
-- gets more expensive with real users.
--
-- No URL is stored anywhere after this. One is signed from the media's
-- objectKey at read time, so changing bucket or storage provider never
-- requires touching a row.

-- Portfolio images -----------------------------------------------------
ALTER TABLE "portfolio_images" DROP COLUMN "url";
ALTER TABLE "portfolio_images" ADD COLUMN "mediaId" TEXT NOT NULL;

-- Profile avatars ------------------------------------------------------
-- Nullable: a profile with no picture is a real state, unlike a portfolio
-- piece with no image.
ALTER TABLE "profiles" DROP COLUMN "avatar";
ALTER TABLE "profiles" ADD COLUMN "avatarMediaId" TEXT;

-- Service images -------------------------------------------------------
-- Deferred out of Module 3 because image handling was pasted-URL-only at
-- the time. The upload pipeline is what makes this worth building.
CREATE TABLE "service_images" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_images_serviceId_idx" ON "service_images"("serviceId");

-- The same file twice on one item is a mistake, not a feature.
CREATE UNIQUE INDEX "service_images_serviceId_mediaId_key" ON "service_images"("serviceId", "mediaId");
CREATE UNIQUE INDEX "portfolio_images_portfolioId_mediaId_key" ON "portfolio_images"("portfolioId", "mediaId");

-- Foreign keys ---------------------------------------------------------
-- RESTRICT on image references: deleting a file that is still on a
-- published portfolio piece or listing must fail loudly, not silently
-- blank the item. The owner detaches it first.
ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_images" ADD CONSTRAINT "service_images_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_images" ADD CONSTRAINT "service_images_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL for avatars: losing the picture must not take the profile with
-- it. This is the one image reference where absence is acceptable.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatarMediaId_fkey"
    FOREIGN KEY ("avatarMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
