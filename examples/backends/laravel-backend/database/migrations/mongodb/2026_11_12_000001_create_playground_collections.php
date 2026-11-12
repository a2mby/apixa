<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use MongoDB\Laravel\Schema\Blueprint;

return new class extends Migration
{
    protected $connection = 'mongodb';

    public function up(): void
    {
        Schema::connection('mongodb')->create('profiles', function (Blueprint $collection) {
            $collection->unique('contact_id');
            $collection->index(['workspace_id' => 1, '_id' => 1]);
            $collection->index('payload.address.city');
        });
        Schema::connection('mongodb')->create('products', function (Blueprint $collection) {
            $collection->unique('sku');
            $collection->unique('slug');
            $collection->index(['workspace_id' => 1, 'category' => 1, '_id' => 1]);
            $collection->index('tags');
        });
        Schema::connection('mongodb')->create('articles', function (Blueprint $collection) {
            $collection->unique('slug');
            $collection->index(['workspace_id' => 1, 'status' => 1, 'rank' => 1, '_id' => 1]);
            $collection->index('comments.contact_id');
        });
    }

    public function down(): void
    {
        foreach (['articles', 'products', 'profiles'] as $collection) {
            Schema::connection('mongodb')->dropIfExists($collection);
        }
    }
};
