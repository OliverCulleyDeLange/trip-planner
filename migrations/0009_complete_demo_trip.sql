UPDATE trips
SET core_json = json_set(
  core_json,
  '$.stage', 'booked',
  '$.preferredDateRange', json('{"start":"2027-01-09","end":"2027-01-16"}')
)
WHERE id = 'demo';

UPDATE participants
SET payload = json_set(payload, '$.confirmed', json('true'))
WHERE trip_id = 'demo';

UPDATE transport_options
SET payload = json_set(
  payload,
  '$.status', 'booked',
  '$.bookingReference', CASE id
    WHEN 'ryanair-stn' THEN 'DEMO-FR464'
    WHEN 'ba-lgw' THEN 'DEMO-BA2576'
    WHEN 'easyjet-brs' THEN 'DEMO-EZY6142'
    WHEN 'man-train' THEN 'DEMO-AWC603'
    WHEN 'ba-lhr' THEN 'DEMO-BA2594'
    WHEN 'geneva-outbound-transfer' THEN 'DEMO-GVA-OUT'
    WHEN 'alps-transfer' THEN 'DEMO-ALPS-OUT'
    WHEN 'turin-return-transfer' THEN 'DEMO-ALPS-IN'
    WHEN 'geneva-return-transfer' THEN 'DEMO-GVA-IN'
    WHEN 'ba-lgw-return' THEN 'DEMO-BA2577'
    WHEN 'easyjet-brs-return' THEN 'DEMO-EZY6143'
    WHEN 'ryanair-stn-return' THEN 'DEMO-FR465'
    WHEN 'ba-lhr-return' THEN 'DEMO-BA2595'
    WHEN 'man-train-return' THEN 'DEMO-AWC1513'
  END,
  '$.votes', CASE id
    WHEN 'ryanair-stn' THEN json('{"oliver":"first-choice","alex":"acceptable"}')
    WHEN 'ba-lgw' THEN json('{"conor":"acceptable"}')
    WHEN 'easyjet-brs' THEN json('{"hanah":"first-choice"}')
    WHEN 'man-train' THEN json('{"jacob":"acceptable"}')
    WHEN 'ba-lhr' THEN json('{"jacob":"acceptable"}')
    WHEN 'geneva-outbound-transfer' THEN json('{"hanah":"first-choice"}')
    WHEN 'alps-transfer' THEN json('{"oliver":"acceptable","alex":"acceptable","conor":"acceptable","jacob":"acceptable"}')
    WHEN 'turin-return-transfer' THEN json('{"oliver":"acceptable","alex":"acceptable","conor":"acceptable","jacob":"acceptable"}')
    WHEN 'geneva-return-transfer' THEN json('{"hanah":"first-choice"}')
    WHEN 'ba-lgw-return' THEN json('{"conor":"acceptable"}')
    WHEN 'easyjet-brs-return' THEN json('{"hanah":"first-choice"}')
    WHEN 'ryanair-stn-return' THEN json('{"oliver":"first-choice","alex":"acceptable"}')
    WHEN 'ba-lhr-return' THEN json('{"jacob":"acceptable"}')
    WHEN 'man-train-return' THEN json('{"jacob":"acceptable"}')
  END
)
WHERE trip_id = 'demo';

UPDATE accommodation_options
SET payload = json_set(
  payload,
  '$.status', CASE WHEN id = 'cristal' THEN 'booked' ELSE 'shortlisted' END,
  '$.participantIds', CASE id
    WHEN 'cristal' THEN json('["oliver","alex","conor","hanah","jacob"]')
    WHEN 'meleze' THEN json('["conor","hanah","jacob"]')
    WHEN 'aigle' THEN json('["oliver","alex","conor","jacob"]')
  END,
  '$.votes', CASE id
    WHEN 'cristal' THEN json('{"oliver":"first-choice","alex":"first-choice","conor":"acceptable","hanah":"acceptable","jacob":"acceptable"}')
    WHEN 'meleze' THEN json('{"conor":"unacceptable","hanah":"acceptable","jacob":"acceptable"}')
    WHEN 'aigle' THEN json('{"oliver":"acceptable","alex":"acceptable","conor":"first-choice","jacob":"first-choice"}')
  END
)
WHERE trip_id = 'demo';

UPDATE accommodation_options
SET payload = json_set(payload, '$.bookingReference', 'DEMO-CRISTAL')
WHERE trip_id = 'demo' AND id = 'cristal';

UPDATE activities
SET payload = json_set(
  payload,
  '$.status', 'booked',
  '$.participantIds', CASE id
    WHEN 'activity-1' THEN json('["oliver","alex","conor"]')
    WHEN 'activity-2' THEN json('["hanah","jacob"]')
  END,
  '$.votes', CASE id
    WHEN 'activity-1' THEN json('{"oliver":"acceptable","alex":"first-choice","conor":"acceptable"}')
    WHEN 'activity-2' THEN json('{"hanah":"first-choice","jacob":"acceptable"}')
  END
)
WHERE trip_id = 'demo';
