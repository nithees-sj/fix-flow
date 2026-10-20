import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller.js';
import { AssetsQuery } from './assets.query.js';
import { CategoriesController } from './categories.controller.js';
import { ChecklistTemplatesController } from './checklists.controller.js';
import { LocationsController } from './locations.controller.js';
import { SlaPoliciesController } from './sla-policies.controller.js';

@Module({
  controllers: [CategoriesController, ChecklistTemplatesController, SlaPoliciesController, LocationsController, AssetsController],
  providers: [AssetsQuery],
  exports: [AssetsQuery],
})
export class CatalogModule {}
