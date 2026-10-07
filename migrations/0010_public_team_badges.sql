-- Public badge display requires both Team permission and member opt-in.
ALTER TABLE user_preferences ADD COLUMN show_team_badges INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_badge_settings ADD COLUMN public_display INTEGER NOT NULL DEFAULT 0;
