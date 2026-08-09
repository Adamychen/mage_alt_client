package org.mage.proxy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MainSecurityTest {

    @TempDir
    Path tempDir;

    @Test
    void resolvesOnlyFilesInsideWebDirectory() throws IOException {
        Path web = Files.createDirectory(tempDir.resolve("web"));
        Path index = Files.write(web.resolve("index.html"), new byte[]{1, 2, 3});
        Path outside = Files.write(tempDir.resolve("outside.txt"), new byte[]{4});

        File resolved = Main.resolveWebFile(web.toString(), "/index.html");

        assertEquals(index.toFile().getCanonicalFile(), resolved);
        assertNull(Main.resolveWebFile(web.toString(), "../outside.txt"));
        assertNull(Main.resolveWebFile(web.toString(), "..\\outside.txt"));
        assertNull(Main.resolveWebFile(web.toString(), "nested/../../outside.txt"));
        assertTrue(outside.toFile().isFile());
    }

    @Test
    void detectsTraversalSegmentsBeforeResourceFallback() {
        assertTrue(Main.hasTraversalSegments("/../pom.xml"));
        assertTrue(Main.hasTraversalSegments("/nested/../pom.xml"));
        assertTrue(Main.hasTraversalSegments("..\\pom.xml"));
        assertTrue(!Main.hasTraversalSegments("/assets/app.js"));
    }
}
