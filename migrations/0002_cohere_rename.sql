-- Switch the AI provider from OpenAI to Cohere.
-- The `openai_model` column now holds a Cohere model id; rename it and reset any
-- OpenAI value left in the single settings row (id = 1) to the new default.
-- Note: SQLite keeps the old `DEFAULT 'gpt-4o'` metadata on the renamed column,
-- but it never fires again — the settings row is inserted once by 0001.
ALTER TABLE settings RENAME COLUMN openai_model TO cohere_model;
UPDATE settings SET cohere_model = 'command-a-plus-05-2026'
  WHERE cohere_model IS NULL OR cohere_model LIKE 'gpt-%';
