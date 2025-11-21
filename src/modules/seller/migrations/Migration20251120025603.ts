import { Migration } from '@mikro-orm/migrations';

export class Migration20251120025603 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "store_phone" text null, add column if not exists "store_description" text null, add column if not exists "store_logo" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller" drop column if exists "store_phone", drop column if exists "store_description", drop column if exists "store_logo";`);
  }

}
