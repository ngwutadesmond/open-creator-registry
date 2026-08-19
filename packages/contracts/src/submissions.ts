export const submissionCategories = [
  { value: 'music', label: 'Music' },
  { value: 'film_tv', label: 'Film & Television' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'content_creator', label: 'Content Creator / Influencer' },
  { value: 'gaming_streaming', label: 'Gaming / Streaming' },
  { value: 'sports', label: 'Sports' },
  { value: 'fashion_beauty', label: 'Fashion / Beauty' },
  { value: 'visual_arts_design', label: 'Visual Arts / Design' },
  { value: 'dance', label: 'Dance / Choreography' },
  { value: 'writing_publishing', label: 'Writing / Publishing' },
  { value: 'podcasting_audio', label: 'Podcasting / Audio' },
  { value: 'education', label: 'Education' },
  { value: 'technology', label: 'Technology' },
  { value: 'business_entrepreneurship', label: 'Business / Entrepreneurship' },
  { value: 'other', label: 'Other' },
] as const;

export type SubmissionCategory = (typeof submissionCategories)[number]['value'];

const submissionCategoryLabels = new Map<string, string>(
  submissionCategories.map(({ label, value }) => [value, label]),
);

const submissionCategoryInputs = new Map<string, SubmissionCategory>(
  submissionCategories.flatMap(({ label, value }) => [
    [value.toLocaleLowerCase('en'), value] as const,
    [label.toLocaleLowerCase('en'), value] as const,
  ]),
);

export function isSubmissionCategory(value: string): value is SubmissionCategory {
  return submissionCategoryLabels.has(value);
}

export function formatSubmissionCategory(value: string | null | undefined): string | null {
  if (!value) return null;
  return submissionCategoryLabels.get(value) ?? value;
}

export function normalizeSubmissionCategoryInput(value: string): SubmissionCategory | null {
  return submissionCategoryInputs.get(value.trim().toLocaleLowerCase('en')) ?? null;
}

export const countryOptions = [
  { code: 'AD', name: 'Andorra' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AG', name: 'Antigua & Barbuda' },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AL', name: 'Albania' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AO', name: 'Angola' },
  { code: 'AQ', name: 'Antarctica' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AT', name: 'Austria' },
  { code: 'AU', name: 'Australia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AX', name: 'Åland Islands' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BA', name: 'Bosnia & Herzegovina' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BI', name: 'Burundi' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BL', name: 'St. Barthélemy' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BQ', name: 'Caribbean Netherlands' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BV', name: 'Bouvet Island' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BZ', name: 'Belize' },
  { code: 'CA', name: 'Canada' },
  { code: 'CC', name: 'Cocos (Keeling) Islands' },
  { code: 'CD', name: 'Congo - Kinshasa' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'CG', name: 'Congo - Brazzaville' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CL', name: 'Chile' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'CW', name: 'Curaçao' },
  { code: 'CX', name: 'Christmas Island' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DE', name: 'Germany' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EE', name: 'Estonia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'EH', name: 'Western Sahara' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'ES', name: 'Spain' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FR', name: 'France' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GE', name: 'Georgia' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'GR', name: 'Greece' },
  { code: 'GS', name: 'South Georgia & South Sandwich Islands' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GU', name: 'Guam' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HK', name: 'Hong Kong SAR China' },
  { code: 'HM', name: 'Heard & McDonald Islands' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HR', name: 'Croatia' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HU', name: 'Hungary' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IN', name: 'India' },
  { code: 'IO', name: 'British Indian Ocean Territory' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IR', name: 'Iran' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IT', name: 'Italy' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JO', name: 'Jordan' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KM', name: 'Comoros' },
  { code: 'KN', name: 'St. Kitts & Nevis' },
  { code: 'KP', name: 'North Korea' },
  { code: 'KR', name: 'South Korea' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LC', name: 'St. Lucia' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LY', name: 'Libya' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MD', name: 'Moldova' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MF', name: 'St. Martin' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MK', name: 'North Macedonia' },
  { code: 'ML', name: 'Mali' },
  { code: 'MM', name: 'Myanmar (Burma)' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'MO', name: 'Macao SAR China' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MT', name: 'Malta' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'MV', name: 'Maldives' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NE', name: 'Niger' },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NU', name: 'Niue' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'OM', name: 'Oman' },
  { code: 'PA', name: 'Panama' },
  { code: 'PE', name: 'Peru' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PL', name: 'Poland' },
  { code: 'PM', name: 'St. Pierre & Miquelon' },
  { code: 'PN', name: 'Pitcairn Islands' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'PS', name: 'Palestinian Territories' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PW', name: 'Palau' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RS', name: 'Serbia' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SH', name: 'St. Helena' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SJ', name: 'Svalbard & Jan Mayen' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SM', name: 'San Marino' },
  { code: 'SN', name: 'Senegal' },
  { code: 'SO', name: 'Somalia' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ST', name: 'São Tomé & Príncipe' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SY', name: 'Syria' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'TC', name: 'Turks & Caicos Islands' },
  { code: 'TD', name: 'Chad' },
  { code: 'TF', name: 'French Southern Territories' },
  { code: 'TG', name: 'Togo' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'TT', name: 'Trinidad & Tobago' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UM', name: 'U.S. Outlying Islands' },
  { code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VA', name: 'Vatican City' },
  { code: 'VC', name: 'St. Vincent & Grenadines' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VG', name: 'British Virgin Islands' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'WF', name: 'Wallis & Futuna' },
  { code: 'WS', name: 'Samoa' },
  { code: 'YE', name: 'Yemen' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
] as const;

export type CountryOption = (typeof countryOptions)[number];
export type CountryCode = CountryOption['code'];

export const countryCodes: readonly CountryCode[] = countryOptions.map(({ code }) => code);

const countryOptionMap = new Map<string, CountryOption>(
  countryOptions.map((option) => [option.code, option]),
);

const countryAliases: Partial<Record<CountryCode, readonly string[]>> = {
  CD: ['Democratic Republic of the Congo', 'DR Congo'],
  CG: ['Republic of the Congo'],
  CI: ['Ivory Coast'],
  CV: ['Cabo Verde'],
  CZ: ['Czech Republic'],
  GB: ['UK', 'Britain', 'Great Britain'],
  HK: ['Hong Kong'],
  KR: ['Korea', 'Republic of Korea'],
  KP: ['DPRK', 'Democratic People’s Republic of Korea'],
  MM: ['Burma'],
  MO: ['Macao', 'Macau'],
  PS: ['Palestine'],
  SZ: ['Swaziland'],
  TL: ['East Timor'],
  TR: ['Turkey'],
  TW: ['Republic of China'],
  US: ['USA', 'America', 'United States of America'],
  VA: ['Holy See'],
};

function normalizeCountryLookupValue(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[’']/gu, '')
    .replace(/&/gu, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

const countryInputCodes = new Map<string, CountryCode>();
for (const option of countryOptions) {
  countryInputCodes.set(normalizeCountryLookupValue(option.code), option.code);
  countryInputCodes.set(normalizeCountryLookupValue(option.name), option.code);
  for (const alias of countryAliases[option.code] ?? []) {
    countryInputCodes.set(normalizeCountryLookupValue(alias), option.code);
  }
}

export const countryOptionsByName: readonly CountryOption[] = [...countryOptions].sort(
  (left, right) => left.name.localeCompare(right.name, 'en'),
);

export function isCountryCode(value: string): value is CountryCode {
  return countryOptionMap.has(value);
}

export function getCountryOption(value: string): CountryOption | undefined {
  return countryOptionMap.get(value.toUpperCase());
}

export function getCountryAliases(code: CountryCode): readonly string[] {
  return countryAliases[code] ?? [];
}

export function formatCountryCode(value: string): string {
  const normalized = value.toUpperCase();
  const option = getCountryOption(normalized);
  return option ? `${option.name} (${option.code})` : value;
}

export function normalizeCountryInput(value: string): CountryCode | null {
  return countryInputCodes.get(normalizeCountryLookupValue(value)) ?? null;
}

export const bulkSubmissionHeaderAliases = {
  creator_name: ['creator_name', 'creator name', 'creator public name', 'name'],
  category: ['category', 'creator category'],
  countries: ['countries', 'country', 'country codes'],
  requested_usernames: ['requested_usernames', 'requested usernames', 'usernames', 'handles'],
  public_sources: ['public_sources', 'public sources', 'source urls', 'supporting links'],
} as const;

export type BulkSubmissionColumn = keyof typeof bulkSubmissionHeaderAliases;

export const bulkSubmissionColumns = Object.keys(
  bulkSubmissionHeaderAliases,
) as BulkSubmissionColumn[];

export const requiredBulkSubmissionColumns: readonly BulkSubmissionColumn[] = [
  'creator_name',
  'category',
  'requested_usernames',
  'public_sources',
];

export const maximumBulkSubmissionRows = 250;
export const maximumBulkSubmissionFileSize = 2 * 1024 * 1024;

export function normalizeBulkSubmissionHeader(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en');
}

const bulkSubmissionColumnByAlias = new Map<string, BulkSubmissionColumn>(
  bulkSubmissionColumns.flatMap((column) =>
    bulkSubmissionHeaderAliases[column].map(
      (alias) => [normalizeBulkSubmissionHeader(alias), column] as const,
    ),
  ),
);

export function resolveBulkSubmissionColumn(value: string): BulkSubmissionColumn | null {
  return bulkSubmissionColumnByAlias.get(normalizeBulkSubmissionHeader(value)) ?? null;
}

export function normalizePublicSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
