// Curated retirement rather than deletion: old projects and favorite snapshots
// retain their exact IDs/settings. Apply by ID also to previously cached catalogs.
export const retiredRecipes={
 soft:'piel-seda',mono:'plata-editorial','editorial-1':'piel-seda','editorial-7':'piel-seda','editorial-10':'piel-seda',
 'editorial-2':'flash-diario','editorial-4':'negative','editorial-8':'nostalgic-summer',
 'online-amber-print':'editorial-0','online-dusty-rose':'editorial-3','online-forest-walk':'online-deep-woodland',
 'online-cinema-teal':'negative','online-desert-light':'shado-albuquerque-35','online-rainy-city':'negative',
 'online-soft-wedding':'piel-seda','online-autumn-paper':'editorial-0','online-warm-portrait':'piel-seda',
 'online-noir-street':'shado-acros-gray-matter','online-soft-silver':'editorial-11','online-summer-postcard':'nostalgic-summer',
 'online-studio-neutral':'online-clean-travel'
};
export function isCatalogRecipeVisible(recipe,{favorites=new Set(),currentId=null,ownIds=new Set()}={}){
 if(ownIds.has(recipe.id))return true;
 return !(recipe.hiddenFromCatalog||Object.hasOwn(retiredRecipes,recipe.id))||favorites.has(recipe.id)||currentId===recipe.id;
}

