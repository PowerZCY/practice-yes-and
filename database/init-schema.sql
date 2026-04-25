-- 第一步：彻底删除 yesand schema（连里面的表、序列、权限全炸）
-- 为防止误操作，该SQL注释掉，只有初始化时才使用！
-- DROP SCHEMA IF EXISTS yesand CASCADE;

-- 第二步：重新创建干净的 yesand schema
CREATE SCHEMA yesand;

-- 第三步：把所有权给 postgres（防止任何权限问题）
ALTER SCHEMA yesand OWNER TO postgres;

REVOKE ALL ON SCHEMA yesand FROM anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA yesand FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA yesand FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA yesand FROM anon, authenticated, service_role;

REVOKE ALL ON SCHEMA yesand FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA yesand FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA yesand FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA yesand FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'yesand_app'
  ) THEN
    CREATE ROLE yesand_app
      LOGIN
      PASSWORD 'XXXyesand_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO yesand_app;
GRANT USAGE ON SCHEMA yesand TO yesand_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA yesand TO yesand_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA yesand TO yesand_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA yesand TO yesand_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA yesand
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA yesand
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO yesand_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA yesand
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO yesand_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA yesand
  GRANT EXECUTE ON FUNCTIONS TO yesand_app;