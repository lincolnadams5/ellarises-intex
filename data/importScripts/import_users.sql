\copy users (
    user_id,
    user_email,
    user_first_name,
    user_last_name,
    user_dob,
    user_role,
    user_phone,
    user_city,
    user_state,
    user_zip,
    user_school,
    user_employer,
    user_field_of_interest
) FROM 'users.csv' WITH (FORMAT csv, HEADER true);