export interface PartnerTypeConfig {
  value: string;
  labelKey: string;
  descriptionKey: string;
  isB2B: boolean;
}

export const PARTNER_TYPES: PartnerTypeConfig[] = [
  {
    value: "referral",
    labelKey: "partnerTypes.referral",
    descriptionKey: "partnerTypes.referralDesc",
    isB2B: false,
  },
  {
    value: "care",
    labelKey: "partnerTypes.care",
    descriptionKey: "partnerTypes.careDesc",
    isB2B: true,
  },
  {
    value: "residential",
    labelKey: "partnerTypes.residential",
    descriptionKey: "partnerTypes.residentialDesc",
    isB2B: true,
  },
  {
    value: "pharmacy",
    labelKey: "partnerTypes.pharmacy",
    descriptionKey: "partnerTypes.pharmacyDesc",
    isB2B: true,
  },
  {
    value: "insurance",
    labelKey: "partnerTypes.insurance",
    descriptionKey: "partnerTypes.insuranceDesc",
    isB2B: true,
  },
  {
    value: "healthcare_provider",
    labelKey: "partnerTypes.healthcareProvider",
    descriptionKey: "partnerTypes.healthcareProviderDesc",
    isB2B: true,
  },
  {
    value: "real_estate",
    labelKey: "partnerTypes.realEstate",
    descriptionKey: "partnerTypes.realEstateDesc",
    isB2B: true,
  },
  {
    value: "expat_community",
    labelKey: "partnerTypes.expatCommunity",
    descriptionKey: "partnerTypes.expatCommunityDesc",
    isB2B: true,
  },
  {
    value: "corporate_other",
    labelKey: "partnerTypes.corporateOther",
    descriptionKey: "partnerTypes.corporateOtherDesc",
    isB2B: true,
  },
];

export const REGIONS = [
  { value: "costa_blanca", labelKey: "regions.costaBlanca" },
  { value: "costa_del_sol", labelKey: "regions.costaDelSol" },
  { value: "costa_brava", labelKey: "regions.costaBrava" },
  { value: "balearic_islands", labelKey: "regions.balearicIslands" },
  { value: "canary_islands", labelKey: "regions.canaryIslands" },
  { value: "madrid", labelKey: "regions.madrid" },
  { value: "barcelona", labelKey: "regions.barcelona" },
  { value: "valencia", labelKey: "regions.valencia" },
  { value: "murcia", labelKey: "regions.murcia" },
  { value: "andalusia_other", labelKey: "regions.andalusiaOther" },
  { value: "other_spain", labelKey: "regions.otherSpain" },
  { value: "portugal", labelKey: "regions.portugal" },
  { value: "other", labelKey: "regions.other" },
];

export const HOW_HEARD_OPTIONS = [
  { value: "google", labelKey: "howHeard.google" },
  { value: "facebook", labelKey: "howHeard.facebook" },
  { value: "friend_referral", labelKey: "howHeard.friendReferral" },
  { value: "existing_partner", labelKey: "howHeard.existingPartner" },
  { value: "expat_forum", labelKey: "howHeard.expatForum" },
  { value: "local_event", labelKey: "howHeard.localEvent" },
  { value: "newspaper_magazine", labelKey: "howHeard.newspaperMagazine" },
  { value: "radio", labelKey: "howHeard.radio" },
  { value: "other", labelKey: "howHeard.other" },
];

/** Helper to check if a partner type is B2B */
export function isB2BPartnerType(type: string): boolean {
  return PARTNER_TYPES.find((pt) => pt.value === type)?.isB2B ?? false;
}

/** Get display label for a partner type (for non-i18n contexts) */
export function getPartnerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    referral: "Referral Partner",
    care: "Care Partner",
    residential: "Residential Partner",
    pharmacy: "Pharmacy",
    insurance: "Insurance Provider",
    healthcare_provider: "Healthcare Provider",
    real_estate: "Real Estate Agent",
    expat_community: "Expat Community",
    corporate_other: "Corporate / Other",
  };
  return labels[type] || type;
}

/** Get display label for a region (for non-i18n contexts) */
export function getRegionLabel(region: string): string {
  const labels: Record<string, string> = {
    costa_blanca: "Costa Blanca",
    costa_del_sol: "Costa del Sol",
    costa_brava: "Costa Brava",
    balearic_islands: "Balearic Islands",
    canary_islands: "Canary Islands",
    madrid: "Madrid",
    barcelona: "Barcelona",
    valencia: "Valencia",
    murcia: "Murcia",
    andalusia_other: "Andalusia (Other)",
    other_spain: "Other Spain",
    portugal: "Portugal",
    other: "Other",
  };
  return labels[region] || region;
}
