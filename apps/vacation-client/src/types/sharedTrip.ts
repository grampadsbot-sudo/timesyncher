export type SharedPlace = {
  id: number | string;
  name?: string;
  title?: string;
  description?: string;
  category?: { name?: string; icon?: string };
  category_name?: string;
  category_icon?: string;
  lat?: number;
  lng?: number;
  address?: string;
  notes?: string;
  place_time?: string;
  logoUrl?: string;
  source?: string | { source?: string };
};

export type SharedDay = {
  id: number | string;
  day_number?: number;
  date?: string;
  title?: string;
};

export type BudgetLine = {
  id?: number | string;
  category?: string;
  name?: string;
  title?: string;
  total_price?: number;
  note?: string;
  sort_order?: number;
};

export type SharedTripPayload = {
  trip?: {
    id?: string;
    title?: string;
    destination?: string;
    start_date?: string;
    end_date?: string;
    currency?: string;
    lat?: number;
    lng?: number;
  };
  places?: SharedPlace[];
  days?: SharedDay[];
  assignments?: Record<string, Array<{ place_id?: number | string; item?: SharedPlace }>>;
  thingOverrides?: Record<string, Record<string, unknown>>;
  budget?: BudgetLine[];
  permissions?: Record<string, boolean>;
  forecast?: unknown[];
  media?: Array<Record<string, unknown>>;
};

export type TabId =
  | 'day-by-day'
  | 'flights'
  | 'hotels'
  | 'cars'
  | 'restaurants'
  | 'stores'
  | 'events'
  | 'packing'
  | 'chat'
  | 'budget';

export const TAB_LABELS: Record<TabId, string> = {
  'day-by-day': 'Day-by-Day',
  flights: 'Flights',
  hotels: 'Hotels',
  cars: 'Cars',
  restaurants: 'Restaurants',
  stores: 'Stores',
  events: 'The Rest',
  packing: 'Packing',
  chat: 'Chat',
  budget: 'Budget',
};
