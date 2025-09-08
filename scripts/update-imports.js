#!/usr/bin/env node

/**
 * Script pour mettre à jour les imports après la restructuration
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const serverDir = 'server/src';
const clientDir = 'client/src';

// Mapping des anciens chemins vers les nouveaux pour le serveur
const serverImportMappings = {
  '@/config/': '#/config/',
  '@/utils/': '#/utils/',
  '@/models/': '#/models/',
  '@/services/': '#/services/',
  '@/db/': '#/db/',
  '@/persistence/': '#/persistence/',
  '@/types/': '#/types/',
  './bot': '#/bot/index',
  './server/fastifyServer': '#/api/fastifyServer',
  '../server/fastifyServer': '#/api/fastifyServer',
};

// Mapping pour le client
const clientImportMappings = {
  '@/': '@/',
  '../': '@/',
  './': '@/',
};

async function getAllTsFiles(dir) {
  const files = [];
  
  async function traverse(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && (extname(entry.name) === '.ts' || extname(entry.name) === '.vue')) {
        files.push(fullPath);
      }
    }
  }
  
  await traverse(dir);
  return files;
}

async function updateImports(filePath, mappings) {
  try {
    let content = await readFile(filePath, 'utf-8');
    let updated = false;
    
    for (const [oldPath, newPath] of Object.entries(mappings)) {
      const regex = new RegExp(`from ['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      if (content.match(regex)) {
        content = content.replace(regex, `from '${newPath}`);
        updated = true;
      }
      
      const importRegex = new RegExp(`import ['"]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      if (content.match(importRegex)) {
        content = content.replace(importRegex, `import '${newPath}`);
        updated = true;
      }
    }
    
    if (updated) {
      await writeFile(filePath, content, 'utf-8');
      console.log(`✅ Updated: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('🔄 Updating imports after restructuring...\n');
  
  // Update server imports
  console.log('📁 Updating server imports...');
  try {
    const serverFiles = await getAllTsFiles(serverDir);
    for (const file of serverFiles) {
      await updateImports(file, serverImportMappings);
    }
  } catch (error) {
    console.error('Error processing server files:', error.message);
  }
  
  // Update client imports
  console.log('\n📁 Updating client imports...');
  try {
    const clientFiles = await getAllTsFiles(clientDir);
    for (const file of clientFiles) {
      await updateImports(file, clientImportMappings);
    }
  } catch (error) {
    console.error('Error processing client files:', error.message);
  }
  
  console.log('\n✅ Import updates completed!');
}

main().catch(console.error);