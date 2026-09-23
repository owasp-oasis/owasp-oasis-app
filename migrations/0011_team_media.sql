-- Optional uploaded Team visuals. Images are validated by the Worker and
-- stored as bounded data URLs until dedicated object storage is provisioned.
ALTER TABLE teams ADD COLUMN logo_image_data TEXT;
ALTER TABLE teams ADD COLUMN banner_image_data TEXT;
