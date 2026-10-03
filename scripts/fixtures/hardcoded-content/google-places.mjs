const key = process.env.GOOGLE_PLACES_API_KEY || process.env.PLACES_API_KEY;
const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
import { PlacesClient } from '@googlemaps/places';
const client = new PlacesClient();
const classic = google.maps.places;
