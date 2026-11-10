SELECT id, trip_id, name, address, lat, lng, website, price, category_id
FROM places
WHERE trip_id = 99 AND id IN (664, 669, 672);

SELECT thing_id, payload
FROM thing_evidence_dossiers
WHERE trip_id = 99 AND thing_id IN (664, 669, 672);
