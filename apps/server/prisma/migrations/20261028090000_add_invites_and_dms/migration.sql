-- AlterEnum
ALTER TYPE "ChannelType" ADD VALUE 'DM';

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "dm_key" TEXT,
ALTER COLUMN "guild_id" DROP NOT NULL,
ALTER COLUMN "name" SET DEFAULT '',
ALTER COLUMN "position" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "channel_participants" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "channel_participants_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "invites" (
    "code" TEXT NOT NULL,
    "guild_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "channel_participants_user_id_idx" ON "channel_participants"("user_id");

-- CreateIndex
CREATE INDEX "invites_guild_id_idx" ON "invites"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_dm_key_key" ON "channels"("dm_key");

-- AddForeignKey
ALTER TABLE "channel_participants" ADD CONSTRAINT "channel_participants_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_participants" ADD CONSTRAINT "channel_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

