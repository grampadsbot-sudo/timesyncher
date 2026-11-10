UPDATE places
SET
  name = 'Big Apple Greeter',
  address = '1 Centre Street, New York, NY 10007',
  lat = 40.7129,
  lng = -74.006,
  website = 'https://www.bigapplegreeter.org/',
  price = 65
WHERE trip_id = 99 AND id = 664;

UPDATE places
SET
  name = 'Birdland Jazz Club',
  address = '315 W 44th St, New York, NY 10036',
  lat = 40.759,
  lng = -73.989,
  website = 'https://www.birdlandjazz.com/',
  price = 40
WHERE trip_id = 99 AND id = 669;

UPDATE places
SET
  name = 'e’s BAR',
  address = '511 Amsterdam Ave, New York, NY 10024',
  lat = 40.787,
  lng = -73.975,
  website = 'https://e-barnyc.com/',
  price = 22
WHERE trip_id = 99 AND id = 672;

UPDATE reservations SET title = 'Big Apple Greeter' WHERE trip_id = 99 AND id = 1464 AND place_id = 664;
UPDATE reservations SET title = 'Birdland Jazz Club' WHERE trip_id = 99 AND id = 1469 AND place_id = 669;
UPDATE reservations SET title = 'e’s BAR' WHERE trip_id = 99 AND id = 1472 AND place_id = 672;
