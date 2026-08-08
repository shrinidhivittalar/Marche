import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServicesService } from '../services/services.service';
import { SearchServicesDto } from '../dto/search-services.dto';

@ApiTags('marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly servicesService: ServicesService) {}

  // Provider discovery, as distinct from listing discovery: a client
  // searching for "a photographer" wants people, not eight listings from
  // the same person. Takes the same filters as GET /services and returns
  // one row per provider with their cheapest matching price.
  //
  // Provider *detail* is not served here — Module 2 already owns that at
  // GET /profiles/:id and GET /u/:username, and a second endpoint would be
  // a second place for visibility rules to drift.
  @Get('providers')
  @ApiOperation({
    summary: 'Discover providers, deduplicated, matching the same filters as service search',
  })
  searchProviders(@Query() query: SearchServicesDto) {
    return this.servicesService.searchProviders(query);
  }
}
