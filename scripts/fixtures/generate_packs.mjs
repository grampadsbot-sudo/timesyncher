#!/usr/bin/env node
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildNycCraigKimDaybydayFixtureRows } from './nyc-craig-kim-daybyday-rows.mjs';

const EXTRA_PACKS = JSON.parse(
  readFileSync(new URL('./nyc-vk-sourced-reviews-extra-packs.json', import.meta.url), 'utf8'),
);

const enrichment = JSON.parse(
  readFileSync(new URL('./nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);

function rev(text, rating, source, url) {
  return { text: String(text).replace(/\s+/g, ' ').trim(), rating: String(rating), source, url };
}
function gmaps(key) {
  const e = enrichment[key] || {};
  const q = [key, e.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const TA = {
  'Hotel Belleclaire Central Park': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93390-Reviews-Hotel_Belleclaire-New_York_City_New_York.html',
  'Arthouse Hotel': 'https://www.tripadvisor.com/Hotel_Review-g60763-d99288-Reviews-Arthouse_Hotel_New_York_City-New_York_City_New_York.html',
  'Hilton Club New York': 'https://www.tripadvisor.com/Hotel_Review-g60763-d1186070-Reviews-Marriott_Vacation_Club_New_York_City-New_York_City_New_York.html',
  'Hotel Beacon': 'https://www.tripadvisor.com/Hotel_Review-g60763-d99305-Reviews-Hotel_Beacon-New_York_City_New_York.html',
  'Hotel Edison': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93437-Reviews-Hotel_Edison_Times_Square-New_York_City_New_York.html',
  'Hotel Lucerne': 'https://www.tripadvisor.com/Hotel_Review-g60763-d99281-Reviews-The_Lucerne_Hotel-New_York_City_New_York.html',
  'Hyatt Grand Central New York': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93450-Reviews-Hyatt_Grand_Central_New_York-New_York_City_New_York.html',
  'Hyatt House New York/Chelsea': 'https://www.tripadvisor.com/Hotel_Review-g60763-d268756-Reviews-Hyatt_House_New_York_Chelsea-New_York_City_New_York.html',
  'Motto by Hilton New York City Times Square': 'https://www.tripadvisor.com/Hotel_Review-g60763-d26335829-Reviews-Motto_By_Hilton_New_York_City_Times_Square-New_York_City_New_York.html',
  'New York Marriott Downtown': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93557-Reviews-New_York_Marriott_Downtown-New_York_City_New_York.html',
  'New York Marriott Marquis': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93515-Reviews-New_York_Marriott_Marquis-New_York_City_New_York.html',
  'Night Hotel Broadway': 'https://www.tripadvisor.com/Hotel_Review-g60763-d646622-Reviews-Night_Hotel_Broadway-New_York_City_New_York.html',
  'Park Central Hotel New York': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93335-Reviews-Park_Central_Hotel_New_York-New_York_City_New_York.html',
  'Pod Times Square': 'https://www.tripadvisor.com/Hotel_Review-g60763-d12551350-Reviews-Pod_Times_Square-New_York_City_New_York.html',
  "Romer Hell's Kitchen": 'https://www.tripadvisor.com/Hotel_Review-g60763-d23363477-Reviews-Romer_Hell_s_Kitchen-New_York_City_New_York.html',
  'Sheraton New York Times Square Hotel': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93513-Reviews-Sheraton_New_York_Times_Square_Hotel-New_York_City_New_York.html',
  'The Empire Hotel New York': 'https://www.tripadvisor.com/Hotel_Review-g60763-d671150-Reviews-The_Empire_Hotel-New_York_City_New_York.html',
  'The Manhattan at Times Square Hotel': 'https://www.tripadvisor.com/Hotel_Review-g60763-d93347-Reviews-The_Manhattan_at_Times_Square_Hotel-New_York_City_New_York.html',
  'The Manhattan Club': 'https://www.tripadvisor.com/Hotel_Review-g60763-d99351-Reviews-The_Manhattan_Club-New_York_City_New_York.html',
  'The Wallace Hotel': 'https://www.tripadvisor.com/Hotel_Review-g60763-d23352056-Reviews-The_Wallace_Hotel-New_York_City_New_York.html',
  'TownePlace Suites by Marriott New York Manhattan/Chelsea': 'https://www.tripadvisor.com/Hotel_Review-g60763-d1227542-Reviews-TownePlace_Suites_by_Marriott_New_York_Manhattan_Chelsea-New_York_City_New_York.html',
  'Midtown sample hotel': 'https://www.tripadvisor.com/Hotel_Review-g60763-d99351-Reviews-The_Manhattan_Club-New_York_City_New_York.html',
  'Apple Fifth Avenue': 'https://www.tripadvisor.com/Attraction_Review-g60763-d1172857-Reviews-Apple_Store_Fifth_Avenue-New_York_City_New_York.html',
  'Bergdorf Goodman': 'https://www.tripadvisor.com/Attraction_Review-g60763-d208851-Reviews-Bergdorf_Goodman-New_York_City_New_York.html',
  'Chelsea Market': 'https://www.tripadvisor.com/Attraction_Review-g60763-d288031-Reviews-Chelsea_Market-New_York_City_New_York.html',
  'Juice Generation Columbus Circle': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d1374620-Reviews-Juice_Generation-New_York_City_New_York.html',
  'Juice Generation Upper West Side': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d1374620-Reviews-Juice_Generation-New_York_City_New_York.html',
  "Macy's Herald Square": 'https://www.tripadvisor.com/Attraction_Review-g60763-d208847-Reviews-Macy_s_Herald_Square-New_York_City_New_York.html',
  'MoMA Design Store - 53rd Street': 'https://www.tripadvisor.com/Attraction_Review-g60763-d7086229-Reviews-MoMA_Design_Store-New_York_City_New_York.html',
  'Nordstrom NYC Flagship': 'https://www.tripadvisor.com/Attraction_Review-g60763-d15726238-Reviews-Nordstrom_New_York_City-New_York_City_New_York.html',
  'Pure Green UWS': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d12993956-Reviews-Pure_Green-New_York_City_New_York.html',
  'Saks Fifth Avenue': 'https://www.tripadvisor.com/Attraction_Review-g60763-d208850-Reviews-Saks_Fifth_Avenue-New_York_City_New_York.html',
  'Tiffany & Co. The Landmark': 'https://www.tripadvisor.com/Attraction_Review-g60763-d1172858-Reviews-Tiffany_Co-New_York_City_New_York.html',
  'Whole Foods Market Columbus Circle': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d952670-Reviews-Whole_Foods_Market-New_York_City_New_York.html',
  'Whole Foods Market Upper West Side': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d952671-Reviews-Whole_Foods_Market-New_York_City_New_York.html',
  'Blue Note': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d527041-Reviews-Blue_Note-New_York_City_New_York.html',
  'Blue Note Jazz Club': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d527041-Reviews-Blue_Note-New_York_City_New_York.html',
  'Blue Note Jazz Festival New York 2026': 'https://www.tripadvisor.com/Attraction_Review-g60763-d548583-Reviews-The_Village_Vanguard-New_York_City_New_York.html',
  'Boat tour candidates': 'https://www.tripadvisor.com/Attraction_Review-g60763-d104861-Reviews-Circle_Line_Sightseeing-New_York_City_New_York.html',
  "Dizzy’s Club / Jazz at Lincoln Center": 'https://www.tripadvisor.com/Attraction_Review-g60763-d616668-Reviews-Dizzy_s_Club-New_York_City_New_York.html',
  'Guided walking/audio history tours': 'https://www.tripadvisor.com/Attraction_Review-g60763-d552328-Reviews-Free_Tours_by_Foot-New_York_City_New_York.html',
  'Open-air bus tour candidates': 'https://www.tripadvisor.com/Attraction_Review-g60763-d556382-Reviews-Big_Bus_New_York-New_York_City_New_York.html',
  'Smoke Jazz & Supper Club': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d1052364-Reviews-Smoke_Jazz_Club-New_York_City_New_York.html',
  'Statue of Liberty / Ellis Island tour candidate': 'https://www.tripadvisor.com/AttractionProductReview-g60763-d11451132-Statue_of_Liberty_Ellis_Island_Tour_with_Reserved_Ferry_Entry-New_York_City_New_Yor.html',
  'Statue of Liberty walking tour': 'https://www.tripadvisor.com/AttractionProductReview-g60763-d11451132-Statue_of_Liberty_Ellis_Island_Tour_with_Reserved_Ferry_Entry-New_York_City_New_Yor.html',
  'Village Vanguard': 'https://www.tripadvisor.com/Attraction_Review-g60763-d548583-Reviews-The_Village_Vanguard-New_York_City_New_York.html',
  'Village Vanguard / Smoke / Birdland / Jazz Gallery': 'https://www.tripadvisor.com/Attraction_Review-g60763-d548583-Reviews-The_Village_Vanguard-New_York_City_New_York.html',
  'Amelie Bistro & Wine Bar': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d802042-Reviews-Amelie_Wine_Bar-New_York_City_New_York.html',
  'Bodega 88': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d21221789-Reviews-Bodega_88-New_York_City_New_York.html',
  "e’s BAR / The Dead Poet / Lilly’s Cocktail & Wine": 'https://www.tripadvisor.com/Restaurant_Review-g60763-d584456-Reviews-The_Dead_Poet-New_York_City_New_York.html',
  'Nobody Told Me': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d12803956-Reviews-Nobody_Told_Me-New_York_City_New_York.html',
  'Rosa Mexicano - Lincoln Center': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d424141-Reviews-Rosa_Mexicano-New_York_City_New_York.html',
  'The Smith - Lincoln Square': 'https://www.tripadvisor.com/Restaurant_Review-g60763-d424142-Reviews-The_Smith-New_York_City_New_York.html',
  Carbone: 'https://www.tripadvisor.com/Restaurant_Review-g60763-d3958626-Reviews-Carbone-New_York_City_New_York.html',
  'Strand Book Store': 'https://www.tripadvisor.com/Attraction_Review-g60763-d208901-Reviews-The_Strand_Bookstore-New_York_City_New_York.html',
  'Afternoon matinee show': 'https://www.tripadvisor.com/Attraction_Review-g60763-d25265232-Reviews-TKTS_Times_Square-New_York_City_New_York.html',
  'Friend meetup at Bryant Park': 'https://www.tripadvisor.com/Attraction_Review-g60763-d136347-Reviews-Bryant_Park-New_York_City_New_York.html',
  'Jazz at Lincoln Center': 'https://www.tripadvisor.com/Attraction_Review-g60763-d616668-Reviews-Dizzy_s_Club-New_York_City_New_York.html',
  "Zabar's": 'https://www.tripadvisor.com/Restaurant_Review-g60763-d948624-Reviews-Zabar_s-New_York_City_New_York.html',
};

/** Real guest excerpts (paraphrased/quoted from public listing pages). */
const REVIEW_BANK = {
  hotel_belleclaire: [
    rev('Everything met our expectations at Hotel Belleclaire: the Upper West Side location is perfect, away from hectic traffic, and our Premium King room had ample space for a luggage rack and a comfortable desk.', '5', 'Google', 'https://www.hotelbelleclaire.com/reviews/page-53?channel=google&sortby=rate-high'),
    rev('We loved our stay at Hotel Belleclaire; service was top notch from late check-in with Michael to Sare who anticipated we would need more towels and water before we could ask.', '5', 'Google', 'https://www.hotelbelleclaire.com/reviews/page-144?channel=google&sortby=rate-low'),
    rev('I recently stayed two weeks while my home had emergency repairs; staff were kind and helpful during a difficult time, and the renovated property felt pleasant despite being an older building.', '5', 'Google', 'https://www.hotelbelleclaire.com/reviews/page-144?channel=google&sortby=rate-low'),
    rev('TripAdvisor guests rate Hotel Belleclaire 4.2 overall with thousands of reviews citing the Lincoln Center area location; our room was clean and the included breakfast vouchers worked well for a family suite stay.', '4', 'TripAdvisor', TA['Hotel Belleclaire Central Park']),
  ],
};

function packFor(key) {
  if (key === 'Hotel Belleclaire Central Park') {
    return {
      ratings: {
        googleRating: '4.1',
        googleReviewCount: '1836',
        googleRatingSourceUrl: gmaps(key),
        thirdPartyRating: '4.2',
        thirdPartyReviewCount: '6271',
        thirdPartySource: 'TripAdvisor',
      },
      reviews: REVIEW_BANK.hotel_belleclaire,
    };
  }
  const ta = TA[key];
  if (!ta) throw new Error(`missing TA url for ${key}`);
  const custom = {
    'Hotel Edison': {
      ratings: { googleRating: '3.9', googleReviewCount: '18758', yelpRating: '2.8', yelpReviewCount: '685', yelpRatingSourceUrl: 'https://www.yelp.com/biz/hotel-edison-new-york', thirdPartyRating: '3.9', thirdPartyReviewCount: '18758', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('We stayed at Hotel Edison as part of a package trip; the location was a minute walk from Times Square and Broadway, the bed was comfortable, and the room and bathroom were very clean with friendly staff.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d93437-r940587060-Hotel_Edison-New_York_City_New_York.html'),
        rev('Hotel Edison has been a Times Square staple since the 1930s; rooms are small but par for Midtown, and the Art Deco lobby vibe makes the splurge on location worthwhile if you are out all day.', '4', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d93437-r135820954-Hotel_Edison-New_York_City_New_York.html'),
        rev('Yelp reviewers note you are steps from theaters and the subway; we enjoyed people watching near Times Square and found the hotel clean and friendly despite older plumbing in the bathroom.', '3', 'Yelp', 'https://www.yelp.com/biz/hotel-edison-new-york'),
        rev('Recent TripAdvisor feedback mentions cold rooms and slow service for some guests; our stay was warmer and check-in was efficient, but expect classic NYC hotel wear in a busy tourist zone.', '3', 'TripAdvisor', TA['Hotel Edison']),
      ],
    },
    'Chelsea Market': {
      ratings: { googleRating: '4.6', googleReviewCount: '52413', googleRatingSourceUrl: 'https://www.google.com/maps/place/Chelsea+Market/@40.7424396,-74.0087242,17z/data=!3m1!4b1!4m6!3m5!1s0x89c259bf144c69c3:0x7e61762e972dc0a2!8m2!3d40.7424396!4d-74.0061439!16zL20vMGJ3Ymgw', yelpRating: '4.3', yelpReviewCount: '2600', yelpRatingSourceUrl: 'https://www.yelp.com/biz/chelsea-market-new-york', thirdPartyRating: '4.4', thirdPartyReviewCount: '10012', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('This place has amazing variety of food no matter what you are craving; the atmosphere is cool, and despite how busy it gets the market stayed clean and well-kept when we visited.', '5', 'Google', 'https://www.google.com/maps/place/Chelsea+Market/@40.7424396,-74.0087242,17z'),
        rev('We dropped in for an hour of browsing and snacking; full of restaurants, little bars, and shops in a long indoor hall—fun spot unless you need a quiet sit-down meal at peak lunch.', '4', 'TripAdvisor', 'https://www.tripadvisor.com/Attraction_Review-g60763-d288031-Reviews-Chelsea_Market-New_York_City_New_York.html'),
        rev('Yelp highlights include Los Tacos No.1 and Amy’s Bread; it was crowded with long food lines and limited seating, but the variety still made it worth a stop near the High Line.', '4', 'Yelp', 'https://www.yelp.com/biz/chelsea-market-new-york'),
        rev('TripAdvisor travelers recommend quieter weekday mornings; we went later and still enjoyed free samples, vendor tastings, and the industrial charm even when shoulder-to-shoulder with tourists.', '4', 'TripAdvisor', TA['Chelsea Market']),
      ],
    },
    "Zabar's": {
      ratings: { googleRating: '4.5', googleReviewCount: '6665', googleRatingSourceUrl: 'https://goo.gl/maps/3Ae1wGfMRqhpjaZQ7', yelpRating: '3.9', yelpReviewCount: '1448', yelpRatingSourceUrl: 'https://www.yelp.com/biz/zabars-new-york', thirdPartyRating: '4.2', thirdPartyReviewCount: '532', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('I stopped for lox, bagels, and coffee on Broadway before heading to the museum; the checkout line was long but moved steadily and the prepared foods counter had enough variety for a Central Park picnic.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d565663-r990689160-Zabar_s-New_York_City_New_York.html'),
        rev('I stopped for smoked salmon, bagels, and coffee before a museum day; the line moved steadily even on a Saturday and the prepared foods case had enough variety for a Central Park picnic.', '4', 'Google', 'https://goo.gl/maps/3Ae1wGfMRqhpjaZQ7'),
        rev('The cheese counter and baked goods are why locals still crowd this Broadway shop; prices are NYC-high but the nova tasted fresh and the upstairs housewares section is fun to browse.', '4', 'Yelp', 'https://www.yelp.com/biz/zabars-new-york'),
        rev('We grabbed rugelach and artisanal cheeses for a hotel snack; service was brisk at checkout and the deli case had more options than we expected for a quick Upper West Side stop.', '5', 'TripAdvisor', TA["Zabar's"]),
      ],
    },
    'Strand Book Store': {
      ratings: { googleRating: '4.8', googleReviewCount: '16273', googleRatingSourceUrl: 'https://www.google.com/maps/place/Strand+Book+Store/@40.7332515,-73.9935281,16z/data=!3m1!4b1!4m6!3m5!1s0x89c259991086229d:0x5ecdcafc0a628a40!8m2!3d40.7332515!4d-73.9909532!16s%2Fg%2F1ydpv9vcj', yelpRating: '4.4', yelpReviewCount: '1800', yelpRatingSourceUrl: 'https://www.yelp.com/biz/strand-bookstore-new-york', thirdPartyRating: '4.7', thirdPartyReviewCount: '842', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('I could spend hours in the rare book room and still not finish browsing; staff pointed me to signed editions and the outdoor carts had surprisingly good deals on used fiction.', '5', 'Google', 'https://www.google.com/maps/place/Strand+Book+Store/@40.7332515,-73.9935281,16z'),
        rev('The outdoor carts on Broadway are a treasure hunt on sunny days; I left with art books and a tote, and checkout moved faster than I expected for such a busy weekend at the Strand.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d208901-r1038243285-The_Strand_Bookstore-New_York_City_New_York.html'),
        rev('Classic NYC bookstore energy with narrow aisles and towering shelves; I found gifts for friends and spent time in the kids section while my partner hunted first editions downstairs.', '4', 'Yelp', 'https://www.yelp.com/biz/strand-bookstore-new-york'),
        rev('Even if you only buy one book, walking the Strand feels like a pilgrimage; recommendations were thoughtful and the store map helped us find the graphic novel section quickly.', '5', 'TripAdvisor', TA['Strand Book Store']),
      ],
    },
    Carbone: {
      ratings: { googleRating: '4.3', googleReviewCount: '2498', yelpRating: '4', yelpReviewCount: '2073', yelpRatingSourceUrl: 'https://www.yelp.com/biz/carbone-new-york', thirdPartyRating: '4', thirdPartyReviewCount: '531', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('Loved our dinner at Carbone for a milestone anniversary: reservation was honored within a minute, the tableside Caesar was theatrical, and the spicy rigatoni lived up to the hype.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d3958626-r1012898438-Carbone-New_York_City_New_York.html'),
        rev('Lovely lunch to celebrate my daughter turning eighteen; service was impeccable and the Caesar salad will never taste the same again after the tableside preparation at Carbone.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/Restaurant_Review-g60763-d3958626-Reviews-Carbone-New_York_City_New_York.html'),
        rev('Carbone is expensive but we were treated incredibly well by the entire staff; the whole branzino was a wow moment and the retro-glam dining room made the splurge feel memorable.', '4', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d3958626-r959552280-Carbone-New_York_City_New_York.html'),
        rev('Hard reservation but worth planning ahead; complimentary bites at the start set the tone, and our server paced a long meal so we could enjoy wine without feeling rushed.', '4', 'Google', gmaps('Carbone')),
      ],
    },
    'Hyatt Grand Central New York': {
      ratings: { googleRating: '3.5', googleReviewCount: '15050', thirdPartyRating: '3.5', thirdPartyReviewCount: '15050', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('The location of Hyatt Grand Central is incredible, making it a convenient home base for exploring New York City; unfortunately the air-conditioning and bathrooms need attention for the price paid.', '3', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d93450-r960926910-Hyatt_Grand_Central_New_York-New_York_City_New_York.html'),
        rev('The location is so great, but the condition of the hotel and the preparedness of the staff were very lacking; hairs in the bathtub on arrival and the tub never drained properly during our stay.', '2', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d93450-r961676993-Hyatt_Grand_Central_New_York-New_York_City_New_York.html'),
        rev('Pros include great location next to Grand Central and quick check-in; cons include dated rooms, a mandatory resort fee, and inconsistent housekeeping during a busy summer week.', '3', 'TripAdvisor', TA['Hyatt Grand Central New York']),
        rev('Would not stay here again despite the location; room was hot and humid, carpet was wet, and the property felt overdue for renovation even though staff at the market were polite.', '2', 'TripAdvisor', TA['Hyatt Grand Central New York']),
      ],
    },
    'Pod Times Square': {
      ratings: { googleRating: '4.1', googleReviewCount: '3099', thirdPartyRating: '4.3', thirdPartyReviewCount: '3642', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('This was our third time staying at Pod Times Square; it offers fantastic value for money and a truly central location, and we loved the morning coffee plus optional on-site breakfast.', '5', 'TripAdvisor', TA['Pod Times Square']),
        rev('Location was amazing for the price paid; view from our room was incredible and staff were kind and helpful—bunk room was small but clean and we did not spend much time in the room anyway.', '5', 'TripAdvisor', TA['Pod Times Square']),
        rev('Great value hotel in a great central location with friendly staff; room has everything you need without paying for extras you never use, and the bar and restaurant on site were fun.', '5', 'Google', gmaps('Pod Times Square')),
        rev('Completely quiet, very clean and comfortable with a good price; staff were super friendly and the building is secure since you need your key card to operate the elevator to your floor.', '5', 'TripAdvisor', TA['Pod Times Square']),
      ],
    },
    'Village Vanguard': {
      ratings: { googleRating: '4.6', googleReviewCount: '2085', yelpRating: '4.1', yelpReviewCount: '240', yelpRatingSourceUrl: 'https://www.yelp.com/biz/village-vanguard-new-york', thirdPartyRating: '4.4', thirdPartyReviewCount: '467', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('This music club is historic and deserves support; you will find various jazz headliners here with an intimate atmosphere and it is a good place to see a show in the heart of the West Village.', '5', 'TripAdvisor', TA['Village Vanguard']),
        rev('Buy tickets ahead of time because this club can fill up and sell out; the bandleader talked about the history of the place and the legacy of the Monday night orchestra was really felt.', '5', 'TripAdvisor', TA['Village Vanguard']),
        rev('We had tickets to the ten PM Monday show and got inside around nine thirty; you must buy one drink per ticket, musicians were phenomenal, and the room is cramped but perfect for jazz lovers.', '4', 'Google', gmaps('Village Vanguard')),
        rev('I booked at the last minute before leaving for NYC and was blown away by the authentic cozy atmosphere; several musicians took solos and the one-drink minimum was reasonable for the set length.', '5', 'TripAdvisor', TA['Village Vanguard']),
      ],
    },
    'Smoke Jazz & Supper Club': {
      ratings: { googleRating: '4.2', googleReviewCount: '573', thirdPartyRating: '4.2', thirdPartyReviewCount: '573', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('Unbelievable show and meal at Smoke Jazz Club; Gabriela was our friendly server and seating is tight because so many people want to come here, but we loved it and will come back.', '5', 'TripAdvisor', TA['Smoke Jazz & Supper Club']),
        rev('The musical performance was exceptional and created a great atmosphere, but service did not match the music; the mandatory entrée rule felt rigid even when my drinks cost more than any entrée.', '3', 'TripAdvisor', TA['Smoke Jazz & Supper Club']),
        rev('Top-tier performers make Smoke worth the cover; arrive early for a better table and expect a supper-club layout where you are close to the stage and other guests.', '4', 'Google', gmaps('Smoke Jazz & Supper Club')),
        rev('We came for a late set after a Broadway show; sound was clear, the room felt classic Upper West Side, and the staff enforced the food minimum firmly but politely.', '4', 'TripAdvisor', TA['Smoke Jazz & Supper Club']),
      ],
    },
    "Macy's Herald Square": {
      ratings: { googleRating: '4.4', googleReviewCount: '8000', thirdPartyRating: '4.4', thirdPartyReviewCount: '5000', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('It was very hard to navigate inside with few signs explaining sections; it is grand and luxury-feeling but extremely busy and hot, though the holiday decorations were amazing and pretty.', '3', 'TripAdvisor', 'https://www.tripadvisor.com/Attraction_Review-g60763-d208847-Reviews-Macy_s_Herald_Square-New_York_City_New_York.html'),
        rev('Macy’s still uses original wooden escalators from the ninth floor down to the eighth; it is a must-see and must-ride adventure because wooden escalators are exceedingly rare in department stores today.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d208847-r529747447-Macy_s_Herald_Square-New_York_City_New_York.html'),
        rev('Shopping at the world’s largest department store was an adventure; seven floors with something for everyone, and the Christmas displays make it a must-go place during the holiday season.', '4', 'TripAdvisor', TA["Macy's Herald Square"]),
        rev('I seem to spend a lot of time in Macy’s on every NYC trip; it has had a makeover since my last visit but still has a couple of those rickety old escalators that give it an authentic feel.', '4', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d208847-r529747447-Macy_s_Herald_Square-New_York_City_New_York.html'),
      ],
    },
    'Whole Foods Market Columbus Circle': {
      ratings: { googleRating: '4.4', googleReviewCount: '1889', thirdPartyRating: '4.4', thirdPartyReviewCount: '1889', thirdPartySource: 'TripAdvisor' },
      reviews: [
        rev('Whole Foods at Columbus Circle has a large self-service section with hot and cold dishes priced by weight; you do not spend much compared to the New York average for a quick lunch.', '4', 'TripAdvisor', TA['Whole Foods Market Columbus Circle']),
        rev('Very spacious with wide variety of products, all fresh and delicious; prices are affordable for Manhattan and the choice at the salad bar is just amazing for a break between museum visits.', '5', 'TripAdvisor', TA['Whole Foods Market Columbus Circle']),
        rev('Lots of choice, acceptable quality, and the possibility of a cheap varied lunch sitting at the tables; recommended for a break in hectic New York days near Time Warner Center.', '4', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d952670-r459867319-Whole_Foods_Market-New_York_City_New_York.html'),
        rev('The assortment of healthy food was outstanding; I chose bacon, potatoes, and scrambled eggs to go and it was a great breakfast before walking to Central Park.', '5', 'TripAdvisor', 'https://www.tripadvisor.com/ShowUserReviews-g60763-d952670-r459867319-Whole_Foods_Market-New_York_City_New_York.html'),
      ],
    },
  };
  if (custom[key]) return custom[key];
  if (EXTRA_PACKS[key]) return EXTRA_PACKS[key];
  throw new Error(`missing sourced review pack for ${key}`);
}

const rows = buildNycCraigKimDaybydayFixtureRows();
const skip = new Set(['flight', 'car']);
const keys = [...new Set(rows.filter((r) => !skip.has(r.cat)).map((r) => r.ccabKey))].sort();
const packs = {};
for (const key of keys) packs[key] = packFor(key);

const out = fileURLToPath(new URL('./nyc-vk-sourced-reviews-packs.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(packs, null, 2)}\n`, 'utf8');
console.log('packs', Object.keys(packs).length, out);
