CREATE INDEX "business_search_trgm_idx" ON "businesses" USING gin ((
        COALESCE(company_name, '') || ' ' ||
        COALESCE(sector, '') || ' ' ||
        COALESCE(city, '') || ' ' ||
        COALESCE(description, '')
      ) gin_trgm_ops);