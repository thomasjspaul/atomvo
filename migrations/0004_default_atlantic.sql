-- Default timezone is now Atlantic (Halifax). Flip rows still on the old
-- migration default; a user who set something else keeps it.
UPDATE settings SET timezone = 'America/Halifax' WHERE timezone = 'America/New_York';
