import os
import psycopg2

# Usamos la misma lógica de configuración:
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    # ¡Usa el host localhost:5432 ya que Docker está mapeado aquí!
    "postgresql://sdn_user:sdn_password@localhost:5432/sdn_database"
)

def test_connection():
    try:
        # Intenta conectar usando la URL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Ejecuta un comando simple para probar
        cursor.execute("SELECT version();")
        db_version = cursor.fetchone()
        
        print("✅ CONEXIÓN EXITOSA A POSTGRESQL")
        print(f"Versión de la Base de Datos: {db_version[0]}")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ ERROR DE CONEXIÓN: {e}")
        print("Asegúrate de que 'psycopg2-binary' esté instalado en tu entorno Python.")

if __name__ == "__main__":
    test_connection()
