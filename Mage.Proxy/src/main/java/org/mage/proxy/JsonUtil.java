package org.mage.proxy;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Date;
import java.util.EnumMap;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reflection based JSON serializer for XMage view objects.
 * <p>
 * Safe for the serialized client views (GameView, TableView, cards, choices...):
 * - skips null fields, static/transient fields and technical fields (loggers, Class, Throwable...)
 * - detects object cycles and writes null for re-entered objects
 * - serializes UUID and Enum as strings, dates as epoch millis
 * <p>
 * NOTE: this is a Phase 0 transport format, it mirrors field names of the Java classes 1:1.
 */
public final class JsonUtil {

    private JsonUtil() {
    }

    public static String toJson(Object root) {
        StringBuilder sb = new StringBuilder(16 * 1024);
        writeValue(sb, root, new IdentityHashMap<>());
        return sb.toString();
    }

    private static void writeValue(StringBuilder sb, Object obj, IdentityHashMap<Object, Boolean> stack) {
        if (obj == null) {
            sb.append("null");
            return;
        }

        Class<?> clazz = obj.getClass();

        if (obj instanceof Character) {
            writeString(sb, obj.toString());
            return;
        }
        if (obj instanceof CharSequence) {
            writeString(sb, obj.toString());
            return;
        }
        if (obj instanceof Boolean || obj instanceof Byte || obj instanceof Short
                || obj instanceof Integer || obj instanceof Long
                || obj instanceof Float || obj instanceof Double) {
            sb.append(obj.toString());
            return;
        }
        if (obj instanceof UUID) {
            writeString(sb, obj.toString());
            return;
        }
        if (obj instanceof Enum) {
            writeString(sb, ((Enum) obj).name());
            return;
        }
        if (obj instanceof Date) {
            sb.append(((Date) obj).getTime());
            return;
        }
        if (obj instanceof Optional) {
            Optional opt = (Optional) obj;
            writeValue(sb, opt.isPresent() ? opt.get() : null, stack);
            return;
        }
        if (clazz == Class.class) {
            writeString(sb, ((Class) obj).getName());
            return;
        }
        if (obj instanceof Throwable) {
            writeString(sb, obj.toString());
            return;
        }

        // cycle detection: same instance already on the current serialization path
        if (stack.containsKey(obj)) {
            sb.append("null");
            return;
        }
        stack.put(obj, Boolean.TRUE);

        if (obj instanceof Map) {
            writeMap(sb, (Map) obj, stack);
        } else if (obj instanceof Iterable) {
            writeIterable(sb, (Iterable) obj, stack);
        } else if (clazz.isArray()) {
            sb.append('[');
            int len = Array.getLength(obj);
            for (int i = 0; i < len; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                writeValue(sb, Array.get(obj, i), stack);
            }
            sb.append(']');
        } else {
            writeObject(sb, obj, stack);
        }

        stack.remove(obj);
    }

    private static void writeMap(StringBuilder sb, Map<?, ?> map, IdentityHashMap<Object, Boolean> stack) {
        sb.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            writeString(sb, String.valueOf(entry.getKey()));
            sb.append(':');
            writeValue(sb, entry.getValue(), stack);
        }
        sb.append('}');
    }

    private static void writeIterable(StringBuilder sb, Iterable<?> iterable, IdentityHashMap<Object, Boolean> stack) {
        sb.append('[');
        boolean first = true;
        for (Object item : iterable) {
            if (!first) {
                sb.append(',');
            }
            first = false;
            writeValue(sb, item, stack);
        }
        sb.append(']');
    }

    private static void writeObject(StringBuilder sb, Object obj, IdentityHashMap<Object, Boolean> stack) {
        sb.append('{');
        boolean first = true;
        for (Class<?> clazz = obj.getClass(); clazz != null && clazz != Object.class; clazz = clazz.getSuperclass()) {
            for (Field field : clazz.getDeclaredFields()) {
                if (!isWritableField(field)) {
                    continue;
                }
                if (!first) {
                    sb.append(',');
                }
                first = false;
                writeString(sb, field.getName());
                sb.append(':');
                try {
                    if (!field.isAccessible()) {
                        field.setAccessible(true);
                    }
                    writeValue(sb, field.get(obj), stack);
                } catch (Exception e) {
                    sb.append("null");
                }
            }
        }
        sb.append('}');
    }

    private static boolean isWritableField(Field field) {
        int mod = field.getModifiers();
        if (Modifier.isStatic(mod) || Modifier.isTransient(mod)) {
            return false;
        }
        String name = field.getName();
        if (name.equals("serialVersionUID") || name.equals("$assertionsDisabled")) {
            return false;
        }
        if (name.equals("logger") || name.equals("log") || name.equals("LOGGER")) {
            return false;
        }
        Class<?> type = field.getType();
        if (type == Class.class || type == Thread.class || type == java.util.logging.Logger.class
                || type == org.apache.log4j.Logger.class || type == StackTraceElement.class
                || type == Throwable.class) {
            return false;
        }
        String typeName = type.getName();
        if (typeName.startsWith("java.lang.reflect.") || typeName.startsWith("sun.reflect.")
                || typeName.startsWith("java.util.concurrent.")
                || typeName.equals("java.lang.Class")) {
            return false;
        }
        return true;
    }

    private static void writeString(StringBuilder sb, String value) {
        if (value == null) {
            sb.append("null");
            return;
        }
        sb.append('"');
        int len = value.length();
        for (int i = 0; i < len; i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"':
                    sb.append("\\\"");
                    break;
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                case '\b':
                    sb.append("\\b");
                    break;
                case '\f':
                    sb.append("\\f");
                    break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }
}
