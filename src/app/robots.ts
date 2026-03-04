import { appConfig } from "@/lib/appConfig";
import { createRobotsHandler } from "@windrun-huaiin/third-ui/lib/server";

export default createRobotsHandler(appConfig.baseUrl);