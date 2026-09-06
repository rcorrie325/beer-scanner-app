-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Beverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "style" TEXT,
    "abv" REAL,
    "volumeMl" INTEGER,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DrinkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "beverageId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "DrinkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrinkLog_beverageId_fkey" FOREIGN KEY ("beverageId") REFERENCES "Beverage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Beverage_barcode_key" ON "Beverage"("barcode");

-- CreateIndex
CREATE INDEX "Beverage_name_idx" ON "Beverage"("name");

-- CreateIndex
CREATE INDEX "DrinkLog_userId_loggedAt_idx" ON "DrinkLog"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "DrinkLog_beverageId_idx" ON "DrinkLog"("beverageId");

-- CreateIndex
CREATE INDEX "DrinkLog_deletedAt_idx" ON "DrinkLog"("deletedAt");
