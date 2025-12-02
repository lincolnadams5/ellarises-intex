-- 8. DONATIONS
COPY donations (
    donation_id,
    user_id,
    donation_date,
    donation_amount
)
FROM '/absolute/path/donations.csv'
WITH (FORMAT csv, HEADER true);