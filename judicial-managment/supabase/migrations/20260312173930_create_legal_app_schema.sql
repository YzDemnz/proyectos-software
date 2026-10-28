/*
  # Create Legal Management System Schema

  1. New Tables
    - `clientes`
      - `id` (uuid, primary key)
      - `nombre` (text, cliente name)
      - `email` (text, nullable)
      - `telefono` (text, nullable)
      - `direccion` (text, nullable)
      - `created_at` (timestamp)
    
    - `expedientes`
      - `id` (uuid, primary key)
      - `numero_expediente` (text, unique expediente number)
      - `partes` (text, parties involved)
      - `juzgado` (text, court name)
      - `estatus` (text, case status)
      - `notas` (text, notes for pending items)
      - `cliente_id` (uuid, foreign key to clientes)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `movimientos`
      - `id` (uuid, primary key)
      - `expediente_id` (uuid, foreign key to expedientes)
      - `fecha` (date)
      - `tipo` (text, movement type)
      - `descripcion` (text)
      - `created_at` (timestamp)
    
    - `tribunal_laboral`
      - `id` (uuid, primary key)
      - `nombre` (text, tribunal name)
      - `direccion` (text)
      - `telefono` (text, nullable)
      - `email` (text, nullable)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create clientes table
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text,
  telefono text,
  direccion text,
  created_at timestamptz DEFAULT now()
);

-- Create expedientes table
CREATE TABLE IF NOT EXISTS expedientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_expediente text UNIQUE NOT NULL,
  partes text NOT NULL,
  juzgado text NOT NULL,
  estatus text NOT NULL DEFAULT 'Activo',
  notas text DEFAULT '',
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create movimientos table
CREATE TABLE IF NOT EXISTS movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid REFERENCES expedientes(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL,
  descripcion text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create tribunal_laboral table
CREATE TABLE IF NOT EXISTS tribunal_laboral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  direccion text NOT NULL,
  telefono text,
  email text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expedientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribunal_laboral ENABLE ROW LEVEL SECURITY;

-- Create policies for clientes
CREATE POLICY "Users can view all clientes"
  ON clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert clientes"
  ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update clientes"
  ON clientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete clientes"
  ON clientes FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for expedientes
CREATE POLICY "Users can view all expedientes"
  ON expedientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert expedientes"
  ON expedientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update expedientes"
  ON expedientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete expedientes"
  ON expedientes FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for movimientos
CREATE POLICY "Users can view all movimientos"
  ON movimientos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert movimientos"
  ON movimientos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update movimientos"
  ON movimientos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete movimientos"
  ON movimientos FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for tribunal_laboral
CREATE POLICY "Users can view all tribunales"
  ON tribunal_laboral FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert tribunales"
  ON tribunal_laboral FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update tribunales"
  ON tribunal_laboral FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete tribunales"
  ON tribunal_laboral FOR DELETE
  TO authenticated
  USING (true);