<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql';

    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('avatar')->nullable();
            $table->jsonb('documents')->default('[]');
        });
        DB::statement('ALTER TABLE products ADD CONSTRAINT products_nonnegative_values CHECK (price >= 0 AND stock >= 0)');
        DB::statement('ALTER TABLE tasks ADD CONSTRAINT tasks_positive_version CHECK (version >= 1)');
        DB::statement('ALTER TABLE counters ADD CONSTRAINT counters_positive_version CHECK (version >= 1)');
        DB::statement('ALTER TABLE documents ADD CONSTRAINT documents_nonnegative_size CHECK (size_bytes >= 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE documents DROP CONSTRAINT documents_nonnegative_size');
        DB::statement('ALTER TABLE counters DROP CONSTRAINT counters_positive_version');
        DB::statement('ALTER TABLE tasks DROP CONSTRAINT tasks_positive_version');
        DB::statement('ALTER TABLE products DROP CONSTRAINT products_nonnegative_values');
        Schema::table('contacts', fn (Blueprint $table) => $table->dropColumn(['avatar', 'documents']));
    }
};
