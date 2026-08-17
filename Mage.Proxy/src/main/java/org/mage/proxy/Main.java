package org.mage.proxy;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;

/**
 * Mage.Proxy entry point.
 * <p>
 * Usage:
 * <pre>
 * java -jar mage-proxy.jar [--host beta.xmage.today] [--port 17171] [--username u] [--password p] [--wsPort 8787] [--httpPort 8788]
 * </pre>
 * Then open http://localhost:8788/index.html (test page) which connects to ws://localhost:8787
 */
public class Main {

    public static void main(String[] args) throws Exception {
        Config config = Config.parse(args);

        Gateway gateway = new Gateway(config);
        ProxyClient client = new ProxyClient(config, gateway);
        gateway.setHandler(client);
        gateway.start();

        System.out.println("[proxy] XMage proxy started");
        System.out.println("[proxy]   websocket gateway : ws://" + config.getBindAddress() + ":" + config.getWsPort() + "/");
        System.out.println("[proxy]   test page         : http://" + config.getBindAddress() + ":" + config.getHttpPort() + "/index.html");
        System.out.println("[proxy]   client version    : " + client.getVersion());
        System.out.println("[proxy]   protocol version  : " + Config.PROTOCOL_VERSION);

        startHttpServer(config);

        if (config.hasAutoConnect()) {
            System.out.println("[proxy] auto-connect to " + config.getServerHost() + ":" + config.getServerPort()
                    + " as " + config.getUsername());
            client.connect(config.getServerHost(), config.getServerPort(), config.getUsername(), config.getPassword());
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            client.shutdown();
            try {
                gateway.stop(1000);
            } catch (InterruptedException ignored) {
            }
        }));
    }

    private static void startHttpServer(Config config) throws IOException {
        HttpServer httpServer = HttpServer.create(new InetSocketAddress(config.getBindAddress(), config.getHttpPort()), 0);
        httpServer.createContext("/", exchange -> serveFile(exchange, config.getWebDir()));
        httpServer.start();
    }

    /**
     * Resuelve un path de petición HTTP a un fichero dentro de webDir.
     * Devuelve null si la ruta canónica escapa de webDir (path traversal),
     * no existe, o webDir no es un directorio.
     */
    static File resolveWebFile(String webDir, String path) throws IOException {
        File base = new File(webDir).getCanonicalFile();
        if (!base.isDirectory()) {
            return null;
        }
        String p = (path == null || path.isEmpty()) ? "/" : path;
        File file = new File(base, p).getCanonicalFile();
        String filePath = file.getPath();
        String basePath = base.getPath();
        if (!filePath.equals(basePath) && !filePath.startsWith(basePath + File.separator)) {
            return null;
        }
        return file.isFile() ? file : null;
    }

    /** true si el path decodificado intenta subir de nivel (guarda para el fallback de recursos). */
    static boolean hasTraversalSegments(String path) {
        if (path == null) {
            return false;
        }
        String p = path;
        if (p.startsWith("/")) {
            p = p.substring(1);
        }
        if (p.equals("..") || p.startsWith("../") || p.contains("/../") || p.endsWith("/..")
                || p.contains("\\..") || p.startsWith("..\\")) {
            return true;
        }
        return false;
    }

    private static void serveFile(HttpExchange exchange, String webDir) {
        try {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                exchange.close();
                return;
            }
            String path = exchange.getRequestURI().getPath();
            if (path == null || path.equals("/")) {
                path = "/index.html";
            }
            // prevent path traversal: solo ficheros dentro de webDir
            File file = resolveWebFile(webDir, path);
            if (file != null) {
                byte[] content = Files.readAllBytes(file.toPath());
                exchange.getResponseHeaders().add("Content-Type", contentType(file.getName()));
                exchange.sendResponseHeaders(200, content.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(content);
                }
                return;
            }
            if (hasTraversalSegments(path)) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            // fallback: serve from the jar resources (/web/index.html)
            java.io.InputStream in = Main.class.getResourceAsStream("/web" + path);
            if (in != null) {
                byte[] content;
                try (java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        bos.write(buf, 0, n);
                    }
                    content = bos.toByteArray();
                }
                exchange.getResponseHeaders().add("Content-Type", contentType(path));
                exchange.sendResponseHeaders(200, content.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(content);
                }
                return;
            }
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
        } catch (Exception ex) {
            try {
                exchange.sendResponseHeaders(500, -1);
            } catch (IOException ignored) {
            }
            exchange.close();
        }
    }

    private static String contentType(String name) {
        if (name.endsWith(".html")) {
            return "text/html; charset=utf-8";
        }
        if (name.endsWith(".js")) {
            return "application/javascript; charset=utf-8";
        }
        if (name.endsWith(".css")) {
            return "text/css; charset=utf-8";
        }
        if (name.endsWith(".json")) {
            return "application/json; charset=utf-8";
        }
        return "application/octet-stream";
    }
}
