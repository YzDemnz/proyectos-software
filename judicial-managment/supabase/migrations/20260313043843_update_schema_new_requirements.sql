/*
  # Update Schema for New Requirements

  1. Modified Tables
    - `clientes`
      - Remove: email, telefono, direccion
      - Add: monto_pactado (agreed fees), total_adeudo (total debt)
    
    - `expedientes`
      - Remove: notas column (integrate with movimientos)
    
    - `movimientos`
      - Add: is_payment (boolean to differentiate movements from transactions)
      - Rename to also handle cargo/abono operations
    
    - `tribunal_laboral`
      - Add: hoja_no_conciliacion (boolean)

  2. New Tables
    - `cliente_movimientos` (for cargo/abono in clientes)
      - `id` (uuid, primary key)
      - `cliente_id` (uuid, foreign key)
      - `tipo` (text: 'cargo' or 'abono')
      - `monto` (numeric)
      - `descripcion` (text)
      - `created_at` (timestamp)

  3. Updates
    - Update RLS policies for new structure
*/

-- Modify clientes table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'email'
  ) THEN
    ALTER TABLE clientes DROP COLUMN IF EXISTS email;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'telefono'
  ) THEN
    ALTER TABLE clientes DROP COLUMN IF EXISTS telefono;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'direccion'
  ) THEN
    ALTER TABLE clientes DROP COLUMN IF EXISTS direccion;
  END IF;
END $$;

-- Add new columns to clientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'monto_pactado'
  ) THEN
    ALTER TABLE clientes ADD COLUMN monto_pactado numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'total_adeudo'
  ) THEN
    ALTER TABLE clientes ADD COLUMN total_adeudo numeric DEFAULT 0;
  END IF;
END $$;

-- Remove notas from expedientes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expedientes' AND column_name = 'notas'
  ) THEN
    ALTER TABLE expedientes DROP COLUMN notas;
  END IF;
END $$;

-- Add is_payment to movimientos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movimientos' AND column_name = 'is_payment'
  ) THEN
    ALTER TABLE movimientos ADD COLUMN is_payment boolean DEFAULT false;
  END IF;
END $$;

-- Create cliente_movimientos table
CREATE TABLE IF NOT EXISTS cliente_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('cargo', 'abono')),
  monto numeric NOT NULL,
  descripcion text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on cliente_movimientos
ALTER TABLE cliente_movimientos ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for cliente_movimientos
CREATE POLICY "Users can view all cliente_movimientos"
  ON cliente_movimientos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert cliente_movimientos"
  ON cliente_movimientos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update cliente_movimientos"
  ON cliente_movimientos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete cliente_movimientos"
  ON cliente_movimientos FOR DELETE
  TO authenticated
  USING (true);

-- Add hoja_no_conciliacion to tribunal_laboral
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tribunal_laboral' AND column_name = 'hoja_no_conciliacion'
  ) THEN
    ALTER TABLE tribunal_laboral ADD COLUMN hoja_no_conciliacion boolean DEFAULT false;
  END IF;
END $$;