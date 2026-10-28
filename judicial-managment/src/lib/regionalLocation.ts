import {
  getRegionalProfileForState,
  regionalCourtProfiles,
  type RegionalAnchor,
  type RegionalCourtProfile,
} from '../data/regionalCourts';

export type RegionalLocationStatus = 'unselected' | 'supported' | 'unsupported' | 'error';
export type RegionalLocationSource = 'device' | 'manual' | 'stored' | null;

export interface RegionalLocationContext {
  status: RegionalLocationStatus;
  source: RegionalLocationSource;
  stateCode: string;
  stateName: string;
  municipality: string;
  profileId: string | null;
  detectedAt: string | null;
  estimatedMunicipality: boolean;
  accuracyKm?: number | null;
  message?: string;
}

export interface MexicoStateOption {
  code: string;
  name: string;
}

export const MEXICO_STATES: MexicoStateOption[] = [
  { code: 'AGU', name: 'Aguascalientes' },
  { code: 'BCN', name: 'Baja California' },
  { code: 'BCS', name: 'Baja California Sur' },
  { code: 'CAM', name: 'Campeche' },
  { code: 'CHP', name: 'Chiapas' },
  { code: 'CHH', name: 'Chihuahua' },
  { code: 'CMX', name: 'Ciudad de México' },
  { code: 'COA', name: 'Coahuila de Zaragoza' },
  { code: 'COL', name: 'Colima' },
  { code: 'DUR', name: 'Durango' },
  { code: 'GUA', name: 'Guanajuato' },
  { code: 'GRO', name: 'Guerrero' },
  { code: 'HID', name: 'Hidalgo' },
  { code: 'JAL', name: 'Jalisco' },
  { code: 'MEX', name: 'Estado de México' },
  { code: 'MIC', name: 'Michoacán de Ocampo' },
  { code: 'MOR', name: 'Morelos' },
  { code: 'NAY', name: 'Nayarit' },
  { code: 'NLE', name: 'Nuevo León' },
  { code: 'OAX', name: 'Oaxaca' },
  { code: 'PUE', name: 'Puebla' },
  { code: 'QUE', name: 'Querétaro' },
  { code: 'ROO', name: 'Quintana Roo' },
  { code: 'SLP', name: 'San Luis Potosí' },
  { code: 'SIN', name: 'Sinaloa' },
  { code: 'SON', name: 'Sonora' },
  { code: 'TAB', name: 'Tabasco' },
  { code: 'TAM', name: 'Tamaulipas' },
  { code: 'TLA', name: 'Tlaxcala' },
  { code: 'VER', name: 'Veracruz de Ignacio de la Llave' },
  { code: 'YUC', name: 'Yucatán' },
  { code: 'ZAC', name: 'Zacatecas' },
];

export const EMPTY_REGIONAL_CONTEXT: RegionalLocationContext = {
  status: 'unselected',
  source: null,
  stateCode: '',
  stateName: '',
  municipality: '',
  profileId: null,
  detectedAt: null,
  estimatedMunicipality: false,
};

const storageKey = (userId: string) => `judicial-regional-location-v1-${userId}`;

const toRadians = (degrees: number) => degrees * (Math.PI / 180);

const distanceInKm = (
  latitude: number,
  longitude: number,
  anchor: RegionalAnchor,
) => {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(anchor.latitude - latitude);
  const longitudeDelta = toRadians(anchor.longitude - longitude);
  const a = (
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitude))
      * Math.cos(toRadians(anchor.latitude))
      * Math.sin(longitudeDelta / 2) ** 2
  );
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const nearestAnchor = (
  profile: RegionalCourtProfile,
  latitude: number,
  longitude: number,
) => profile.anchors.reduce<{ anchor: RegionalAnchor; distance: number } | null>((nearest, anchor) => {
  const distance = distanceInKm(latitude, longitude, anchor);
  if (!nearest || distance < nearest.distance) return { anchor, distance };
  return nearest;
}, null);

const profileContainsCoordinates = (
  profile: RegionalCourtProfile,
  latitude: number,
  longitude: number,
) => (
  latitude >= profile.bounds.minLatitude
  && latitude <= profile.bounds.maxLatitude
  && longitude >= profile.bounds.minLongitude
  && longitude <= profile.bounds.maxLongitude
);

export const inferRegionalContext = (
  latitude: number,
  longitude: number,
  accuracyMeters?: number | null,
): RegionalLocationContext => {
  const candidates = regionalCourtProfiles
    .filter((profile) => profileContainsCoordinates(profile, latitude, longitude))
    .map((profile) => ({ profile, nearest: nearestAnchor(profile, latitude, longitude) }))
    .filter(({ profile, nearest }) => Boolean(nearest && nearest.distance <= profile.maxDetectionDistanceKm))
    .sort((left, right) => (left.nearest?.distance ?? Number.POSITIVE_INFINITY) - (right.nearest?.distance ?? Number.POSITIVE_INFINITY));
  const match = candidates[0];

  if (!match) {
    return {
      ...EMPTY_REGIONAL_CONTEXT,
      status: 'unsupported',
      source: 'device',
      detectedAt: new Date().toISOString(),
      accuracyKm: accuracyMeters ? Math.round((accuracyMeters / 1000) * 10) / 10 : null,
      message: 'No hay un catálogo regional compatible con la ubicación aproximada del equipo.',
    };
  }

  return {
    status: 'supported',
    source: 'device',
    stateCode: match.profile.stateCode,
    stateName: match.profile.stateName,
    municipality: match.nearest?.anchor.municipio ?? '',
    profileId: match.profile.id,
    detectedAt: new Date().toISOString(),
    estimatedMunicipality: true,
    accuracyKm: accuracyMeters ? Math.round((accuracyMeters / 1000) * 10) / 10 : null,
    message: 'Confirma el estado y municipio antes de cargar el catálogo.',
  };
};

const requestPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Este equipo no ofrece el servicio de ubicación.'));
    return;
  }

  navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: false,
    timeout: 12_000,
    maximumAge: 10 * 60 * 1000,
  });
});

const getGeolocationErrorMessage = (error: unknown) => {
  const geolocationError = error as Partial<GeolocationPositionError> | null;
  if (typeof geolocationError?.code === 'number') {
    if (geolocationError.code === 1) return 'No se concedió permiso para usar la ubicación del equipo.';
    if (geolocationError.code === 2) return 'El equipo no pudo determinar su ubicación.';
    if (geolocationError.code === 3) return 'La consulta de ubicación tardó demasiado.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'No fue posible consultar la ubicación del equipo.';
};

export const detectRegionalContextFromDevice = async (): Promise<RegionalLocationContext> => {
  try {
    const position = await requestPosition();
    return inferRegionalContext(
      position.coords.latitude,
      position.coords.longitude,
      position.coords.accuracy,
    );
  } catch (error) {
    return {
      ...EMPTY_REGIONAL_CONTEXT,
      status: 'error',
      source: 'device',
      detectedAt: new Date().toISOString(),
      message: getGeolocationErrorMessage(error),
    };
  }
};

export const createManualRegionalContext = (
  stateCode: string,
  municipality: string,
): RegionalLocationContext => {
  const state = MEXICO_STATES.find((item) => item.code === stateCode);
  const profile = getRegionalProfileForState(stateCode);
  const selectedMunicipality = municipality.trim();

  if (!state) {
    return {
      ...EMPTY_REGIONAL_CONTEXT,
      status: 'error',
      source: 'manual',
      message: 'Selecciona un estado para continuar.',
    };
  }

  return {
    status: profile ? 'supported' : 'unsupported',
    source: 'manual',
    stateCode: state.code,
    stateName: state.name,
    municipality: selectedMunicipality,
    profileId: profile?.id ?? null,
    detectedAt: new Date().toISOString(),
    estimatedMunicipality: false,
    message: profile
      ? 'Región seleccionada manualmente.'
      : 'No disponible en tu región.',
  };
};

export const saveRegionalContext = (userId: string, context: RegionalLocationContext) => {
  if (!userId) return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(context));
};

export const loadRegionalContext = (userId: string): RegionalLocationContext | null => {
  if (!userId) return null;
  const stored = window.localStorage.getItem(storageKey(userId));
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<RegionalLocationContext>;
    if (!['supported', 'unsupported'].includes(String(parsed.status))) return null;
    return {
      status: parsed.status as RegionalLocationStatus,
      source: 'stored',
      stateCode: typeof parsed.stateCode === 'string' ? parsed.stateCode : '',
      stateName: typeof parsed.stateName === 'string' ? parsed.stateName : '',
      municipality: typeof parsed.municipality === 'string' ? parsed.municipality : '',
      profileId: typeof parsed.profileId === 'string' ? parsed.profileId : null,
      detectedAt: typeof parsed.detectedAt === 'string' ? parsed.detectedAt : null,
      estimatedMunicipality: Boolean(parsed.estimatedMunicipality),
      accuracyKm: typeof parsed.accuracyKm === 'number' ? parsed.accuracyKm : null,
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
    };
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return null;
  }
};
