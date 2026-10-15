/**
 * Provenance vocabulary. Every value shown in the UI is tagged with one of
 * these so the interface can distinguish measured, modelled, forecast,
 * calculated, estimated, stale and unavailable data.
 */
export type DataKind =
  | 'measured' // instrument observation (none of the default providers supply this)
  | 'modeled' // numerical weather model analysis / nowcast for the grid cell
  | 'forecast' // model prediction for a future time
  | 'calculated' // deterministic geometry (astronomy)
  | 'estimated' // derived by this app from other values with stated assumptions
  | 'user'; // entered by the user

export const KIND_LABEL: Record<DataKind, string> = {
  measured: 'Measured',
  modeled: 'Model estimate',
  forecast: 'Forecast',
  calculated: 'Calculated',
  estimated: 'App estimate',
  user: 'Your entry',
};

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  license: string;
  attribution: string;
  /** What this provider's numbers represent. */
  nature: string;
}

export interface CurrentConditions {
  /** Unix ms of the model time step the values describe. */
  time: number;
  temperature: number | null; // °C
  apparentTemperature: number | null; // °C
  humidity: number | null; // %
  cloudCover: number | null; // %
  windSpeed: number | null; // km/h
  windGusts: number | null; // km/h
  precipitation: number | null; // mm
  weatherCode: number | null; // WMO code
  isDay: boolean | null;
  /** Present only if the provider returned a current UV value. */
  uvIndex: number | null;
}

export interface HourlySeries {
  time: number[]; // unix ms (start of hour)
  temperature: (number | null)[];
  apparentTemperature: (number | null)[];
  humidity: (number | null)[];
  precipitationProbability: (number | null)[];
  precipitation: (number | null)[];
  weatherCode: (number | null)[];
  cloudCover: (number | null)[];
  windSpeed: (number | null)[];
  uvIndex: (number | null)[];
  uvIndexClearSky: (number | null)[];
  /** Global horizontal irradiance, W/m², mean of the PRECEDING hour. */
  shortwave: (number | null)[];
  direct: (number | null)[];
  diffuse: (number | null)[];
  directNormal: (number | null)[];
}

export interface DailySeries {
  time: number[]; // unix ms of local midnight
  weatherCode: (number | null)[];
  temperatureMax: (number | null)[];
  temperatureMin: (number | null)[];
  uvIndexMax: (number | null)[];
  uvIndexClearSkyMax: (number | null)[];
  precipitationSum: (number | null)[];
  precipitationProbabilityMax: (number | null)[];
  sunrise: (number | null)[];
  sunset: (number | null)[];
}

export interface EnvSnapshot {
  provider: ProviderInfo;
  fetchedAt: number;
  latitude: number;
  longitude: number;
  /** IANA zone reported by the provider for the coordinates. */
  timezone: string | null;
  utcOffsetSeconds: number | null;
  /** Elevation of the model grid / DEM used by the provider, metres. */
  gridElevation: number | null;
  current: CurrentConditions | null;
  hourly: HourlySeries | null;
  daily: DailySeries | null;
  /** Requested fields the provider did not return (shown as unavailable). */
  missing: string[];
  /** True if the full request failed and a reduced variable set was used. */
  reduced: boolean;
}

export interface WeatherProvider {
  info: ProviderInfo;
  fetchSnapshot(req: { latitude: number; longitude: number; elevation?: number | null; signal?: AbortSignal }): Promise<EnvSnapshot>;
}

export interface GeocodeResult {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  timezone: string | null;
}

export class ProviderError extends Error {
  readonly kind: 'network' | 'http' | 'rate-limit' | 'invalid' | 'timeout' | 'aborted';
  readonly status?: number;
  constructor(kind: ProviderError['kind'], message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}
